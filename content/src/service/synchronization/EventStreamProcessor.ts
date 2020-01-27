import { pipeline, Stream } from "stream"
import util from "util"
import parallelTransform from "parallel-transform"
import { DeploymentEvent, DeploymentHistory } from "../history/HistoryManager";
import { sortFromOldestToNewest } from "../time/TimeSorting";
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { HistoryDeploymentOptions } from "./EventDeployer";

/**
 * This class processes a given history as a stream, and even makes some of the downloading in parallel.
 * However, it will always deploy the older events fist.
 */
export class EventStreamProcessor {

    private static readonly PARALLEL_DOWNLOAD_WORKERS = 15

    constructor(private readonly deploymentBuilder: DeploymentPreparation) { }

    /**
     * This method takes a history, goes through each event and tries to deploy them locally.
     */
    async deployHistory(history: DeploymentHistory, options?: HistoryDeploymentOptions) {
        const logging = options?.logging ?? false
        const continueOnFailure = options?.continueOnFailure ?? false

        // Sort from oldest to newest
        const sortedHistory = sortFromOldestToNewest(history)

        // Create a readable stream with all the deployments
        const deploymentsStream = this.prepareSourceStream(sortedHistory);

        // Build a transform stream that process the deployment info and prepares the deployment
        const transform = this.prepareDeploymentBuilder(history.length, continueOnFailure, options?.preferredServer)

        // Create writer stream that deploys the entity on this server
        const deployerStream = this.prepareStreamDeployer(history.length, logging, continueOnFailure);

        // Build pipeline than can be awaited
        const awaitablePipeline = util.promisify(pipeline);

        // Build and execute the pipeline
        try {
            await awaitablePipeline(deploymentsStream, transform, deployerStream)
        } catch(error) {
            console.log(`Something failed when trying to deploy the history:\n${error}`)
        }
    }

    /** Build the source stream reader that provides the history */
    private prepareSourceStream(deploymentHistory: DeploymentHistory) {
        const readable = new Stream.Readable({ objectMode: true });
        deploymentHistory.forEach((deployment, index) => readable.push([index, deployment]));
        readable.push(null); // Mark the end of the stream
        return readable;
    }

    /**
     * Build a transform stream that takes the deployment information and downloads all files necessary to deploy it locally.
     * We will download everything in parallel, but it will be deployed in order
     */
    private prepareDeploymentBuilder(historyLength: number, continueOnFailure: boolean, preferredServer: ContentServerClient | undefined) {
        return parallelTransform(EventStreamProcessor.PARALLEL_DOWNLOAD_WORKERS, { objectMode: true }, async ([index, deploymentEvent], done) => {
            try {
                const execution = await this.deploymentBuilder(deploymentEvent, preferredServer);
                done(null, [index, deploymentEvent.entityId, execution]);
            } catch (error) {
                console.log(`Failed preparing the deployment ${index + 1}/${historyLength}. Entity id is ${deploymentEvent.entityId}`);
                if (continueOnFailure) {
                    console.log(`Error was:\n${error}`)
                    done();
                } else {
                    done(error);
                }
            }
        });
    }

    /** Build the stream writer that will execute the deployment */
    private prepareStreamDeployer(historyLength: number, logging: boolean, continueOnFailure: boolean) {
        return new Stream.Writable({
            objectMode: true,
            write: async ([index, entityId, performDeployment], _, done) => {
                try {
                    await performDeployment();
                    if (logging) {
                        console.log(`Deployed ${index + 1}/${historyLength}. Entity id is ${entityId}`);
                    }
                    done();
                } catch (error) {
                    console.log(`Failed when trying to deploy ${index + 1}/${historyLength}. Entity id is ${entityId}`);
                    if (continueOnFailure) {
                        console.log(`Error was:\n${error}`)
                        done();
                    } else {
                        done(error);
                    }
                }
            },
        });
    }
}

type DeploymentPreparation = (event: DeploymentEvent, preferred?: ContentServerClient) => Promise<DeploymentExecution>
type DeploymentExecution = () => Promise<void>