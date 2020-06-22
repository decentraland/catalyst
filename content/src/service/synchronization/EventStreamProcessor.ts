import { Writable } from "stream"
import parallelTransform from "parallel-transform"
import log4js from "log4js"
import { DeploymentWithAuditInfo } from "dcl-catalyst-commons";
import { streamFrom, awaitablePipeline } from "@katalyst/content/helpers/StreamHelper";
import { Deployment } from "@katalyst/content/service/deployments/DeploymentManager";
import { sortNonComparableFromOldestToNewest } from "../time/TimeSorting";
import { ContentServerClient } from "./clients/ContentServerClient";
import { HistoryDeploymentOptions } from "./EventDeployer";

/**
 * This class processes a given history as a stream, and even makes some of the downloading in parallel.
 * However, it will always deploy the older events fist.
 */
export class EventStreamProcessor {

    private static readonly LOGGER = log4js.getLogger('EventStreamProcessor');
    private static readonly PARALLEL_DOWNLOAD_WORKERS = 15

    constructor(private readonly deploymentBuilder: DeploymentPreparation) { }

    /**
     * This method takes a load of deployments, goes through each event and tries to deploy them locally.
     */
    async processDeployments(deployments: DeploymentWithAuditInfo[], options?: HistoryDeploymentOptions) {
        // Sort from oldest to newest
        const sortedHistory = sortNonComparableFromOldestToNewest(deployments, event => event.entityTimestamp)

        // Create a readable stream with all the deployments
        const deploymentsStream = streamFrom(sortedHistory.map((event, index) => [index, event]));

        // Build a transform stream that process the deployment info and prepares the deployment
        const transform = this.prepareDeploymentBuilder(deployments.length, options)

        // Create writer stream that deploys the entity on this server
        const deployerStream = this.prepareStreamDeployer(deployments.length, options);

        // Build and execute the pipeline
        try {
            await awaitablePipeline(deploymentsStream, transform, deployerStream)
        } catch(error) {
            EventStreamProcessor.LOGGER.error(`Something failed when trying to deploy the history:\n${error}`)
        }
    }

    /**
     * Build a transform stream that takes the deployment information and downloads all files necessary to deploy it locally.
     * We will download everything in parallel, but it will be deployed in order
     */
    private prepareDeploymentBuilder(historyLength: number, options?: HistoryDeploymentOptions) {
        return parallelTransform(EventStreamProcessor.PARALLEL_DOWNLOAD_WORKERS, { objectMode: true }, async ([index, deploymentEvent], done) => {
            try {
                EventStreamProcessor.LOGGER.trace(`Preparing deployment for ${index + 1}/${historyLength}. Entity (${deploymentEvent.entityType}, ${deploymentEvent.entityId})`)
                const execution = await this.deploymentBuilder(deploymentEvent, options?.preferredServer);
                EventStreamProcessor.LOGGER.trace(`Deployment prepared for ${index + 1}/${historyLength}. Entity (${deploymentEvent.entityType}, ${deploymentEvent.entityId})`)
                done(null, [index, deploymentEvent.entityType, deploymentEvent.entityId, execution]);
            } catch (error) {
                EventStreamProcessor.LOGGER.debug(`Failed preparing the deployment ${index + 1}/${historyLength}. Entity is (${deploymentEvent.entityType}, ${deploymentEvent.entityId}). Error was:\n${error}`)
                done();
            }
        });
    }

    /** Build the stream writer that will execute the deployment */
    private prepareStreamDeployer(historyLength: number, options?: HistoryDeploymentOptions) {
        return new Writable({
            objectMode: true,
            write: async ([index, entityType, entityId, performDeployment], _, done) => {
                try {
                    await performDeployment();
                    if (options?.logging) {
                        EventStreamProcessor.LOGGER.info(`Deployed ${index + 1}/${historyLength}. Entity is (${entityType}, ${entityId})`);
                    } else {
                        EventStreamProcessor.LOGGER.trace(`Deployed ${index + 1}/${historyLength}. Entity is (${entityType}, ${entityId})`)
                    }
                    done();
                } catch (error) {
                    EventStreamProcessor.LOGGER.debug(`Failed when trying to deploy ${index + 1}/${historyLength}. Entity is (${entityType}, ${entityId}). Error was:\n${error}`)
                    done();
                }
            },
        });
    }
}

type DeploymentPreparation = (event: Deployment, preferred?: ContentServerClient) => Promise<DeploymentExecution>
type DeploymentExecution = () => Promise<void>