import { Writable, Readable } from "stream"
import parallelTransform from "parallel-transform"
import log4js from "log4js"
import { DeploymentWithAuditInfo, EntityId } from "dcl-catalyst-commons";
import { awaitablePipeline, streamMap, streamFilter, mergeStreams } from "@katalyst/content/service/synchronization/streaming/StreamHelper";
import { Deployment } from "@katalyst/content/service/deployments/DeploymentManager";
import { ContentServerClient } from "../clients/ContentServerClient";
import { HistoryDeploymentOptions } from "../EventDeployer";
import { OnlyNotDeployedFilter } from "./OnlyNotDeployedFilter";

/**
 * This class processes a given history as a stream, and even makes some of the downloading in parallel.
 */
export class EventStreamProcessor {

    private static readonly LOGGER = log4js.getLogger('EventStreamProcessor');
    private static readonly PARALLEL_DOWNLOAD_WORKERS = 15

    constructor(
        private readonly checkIfAlreadyDeployed: (entityIds: EntityId[]) => Promise<Map<EntityId, boolean>>,
        private readonly deploymentBuilder: DeploymentPreparation) { }

    /**
     * This method takes many deployment streams and tries to deploy them locally.
     */
    async processDeployments(deployments: Readable[], options?: HistoryDeploymentOptions) {
        // Merge the streams from the different servers
        const merged = mergeStreams(deployments);

        // TODO: Remove on next deployment
        // Delete information that is not yet excluded from the response
        const reduceExtraInfo = streamMap(({ entityType, entityId, entityTimestamp, deployedBy, auditInfo }) => {
            delete auditInfo.denylistedContent
            delete auditInfo.isDenylisted
            return { entityType, entityId, entityTimestamp, deployedBy, auditInfo }
        })

        // A transform that will filter out duplicate deployments
        const filterOutDuplicates = this.filterOutDuplicates()

        // This transform will filter out entities that have already been deployed locally
        const filterOutAlreadyDeployed = new OnlyNotDeployedFilter(entityIds => this.checkIfAlreadyDeployed(entityIds))

        // Build a transform stream that process the deployment info and prepares the deployment
        const downloadFilesTransform = this.prepareDeploymentBuilder(options)

        // Create writer stream that deploys the entity on this server
        const deployer = this.prepareStreamDeployer(options);

        // Build and execute the pipeline
        try {
            await awaitablePipeline(merged, reduceExtraInfo, filterOutDuplicates, filterOutAlreadyDeployed, downloadFilesTransform, deployer)
        } catch(error) {
            EventStreamProcessor.LOGGER.error(`Something failed when trying to deploy the history:\n${error}`)
        }
    }

    private filterOutDuplicates() {
        const known: Set<EntityId> = new Set()
        return streamFilter((deployment: DeploymentWithAuditInfo) => {
            if (known.has(deployment.entityId)) {
                return false
            }
            known.add(deployment.entityId)
            return true
        })
    }

    /**
     * Build a transform stream that takes the deployment information and downloads all files necessary to deploy it locally.
     */
    private prepareDeploymentBuilder(options?: HistoryDeploymentOptions) {
        return parallelTransform(EventStreamProcessor.PARALLEL_DOWNLOAD_WORKERS, { objectMode: true, ordered: false }, async (deploymentEvent, done) => {
            try {
                EventStreamProcessor.LOGGER.trace(`Preparing deployment. Entity (${deploymentEvent.entityType}, ${deploymentEvent.entityId})`)
                const execution = await this.deploymentBuilder(deploymentEvent, options?.preferredServer);
                EventStreamProcessor.LOGGER.trace(`Deployment prepared. Entity (${deploymentEvent.entityType}, ${deploymentEvent.entityId})`)
                done(null, [deploymentEvent.entityType, deploymentEvent.entityId, execution]);
            } catch (error) {
                EventStreamProcessor.LOGGER.debug(`Failed preparing the deployment. Entity is (${deploymentEvent.entityType}, ${deploymentEvent.entityId}). Error was:\n${error}`)
                done(null, null);
            }
        });
    }

    /** Build the stream writer that will execute the deployment */
    private prepareStreamDeployer(options?: HistoryDeploymentOptions) {
        return new Writable({
            objectMode: true,
            write: async ([entityType, entityId, performDeployment], _, done) => {
                try {
                    await performDeployment();
                    if (options?.logging) {
                        EventStreamProcessor.LOGGER.info(`Deployed entity (${entityType}, ${entityId})`);
                    } else {
                        EventStreamProcessor.LOGGER.trace(`Deployed entity (${entityType}, ${entityId})`)
                    }
                    done();
                } catch (error) {
                    EventStreamProcessor.LOGGER.debug(`Failed when trying to deploy entity is (${entityType}, ${entityId}). Error was:\n${error}`)
                    done();
                }
            },
        });
    }
}

type DeploymentPreparation = (event: Deployment, preferred?: ContentServerClient) => Promise<DeploymentExecution>
type DeploymentExecution = () => Promise<void>