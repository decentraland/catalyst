import log4js from 'log4js'
import { DeploymentId } from "@katalyst/content/storage/repositories/DeploymentsRepository";
import { Repository } from "@katalyst/content/storage/Repository";
import { Timestamp } from "@katalyst/content/service/time/TimeSorting";
import { SystemPropertiesManager, SystemProperty } from "@katalyst/content/service/system-properties/SystemProperties";
import { delay } from 'decentraland-katalyst-utils/util';
import ms from 'ms';
import { ServiceStorage } from '../ServiceStorage';

export class GarbageCollectionManager {

    private static readonly LOGGER = log4js.getLogger('GarbageCollectionManager');
    private readonly overwrittenDeployments: Set<DeploymentId> = new Set()
    private nextGarbageCollectionTimeout: NodeJS.Timeout;
    private stopping = false
    private sweeping = false

    constructor(
        private readonly systemPropertiesManager: SystemPropertiesManager,
        private readonly repository: Repository,
        private readonly serviceStorage: ServiceStorage,
        private readonly performGarbageCollection: boolean,
        private readonly sweepInterval: number) { }

    async start(): Promise<void> {
        if (this.performGarbageCollection) {
            this.stopping = false
            await this.calculateOverwrittenDeployments()
            await this.performSweep()
        }
    }

    async stop(): Promise<void> {
        if (this.performGarbageCollection) {
            clearTimeout(this.nextGarbageCollectionTimeout)
            this.stopping = true
            await this.waitUntilSyncFinishes()
        }
    }

    /**
     * Since the server was not keeping track, we will look for all the deployments that were overwritten since the last garbage collection was
     * executed. We will do this by checking the local timestamp of the overwriting deployment. This could lead to a situation where deployments are
     * garbage collected more than once, but it should be rare.
     */
    async calculateOverwrittenDeployments(): Promise<void> {
        try {
            const overwrittenDeployments = await this.repository.task(async task => {
                const lastGarbageCollectionTime: Timestamp = await this.systemPropertiesManager.getSystemProperty(SystemProperty.LAST_GARBAGE_COLLECTION_TIME, task) ?? 0
                return task.deployments.findDeploymentsOverwrittenAfter(lastGarbageCollectionTime)
            })
            overwrittenDeployments.forEach(overwrittenDeployment => this.overwrittenDeployments.add(overwrittenDeployment))
        } catch (error) {
            GarbageCollectionManager.LOGGER.warn(`Can't initiate garbage collection. Reason:\n${error}`)
        }
    }

    /**
     * When it is time, we will calculate the hashes of all the overwritten deployments, and check if they are not being used by another deployment.
     * If they are not being used, then we will delete them.
     */
    async performSweep() {
        const timeOfCollection: Timestamp = Date.now()
        const overwrittenDeployments = Array.from(this.overwrittenDeployments.values())
        this.sweeping = true
        try {
            if (overwrittenDeployments.length > 0) {
                GarbageCollectionManager.LOGGER.debug(`Will check hashes for deployments with ids: ${overwrittenDeployments}`)
                await this.repository.tx(async transaction => {
                    const hashes = await transaction.content.findContentHashesNotBeingUsedAnymore(overwrittenDeployments)
                    GarbageCollectionManager.LOGGER.debug(`Hashes to delete are: ${hashes}`)
                    await this.serviceStorage.deleteContent(hashes)
                    await this.systemPropertiesManager.setSystemProperty(SystemProperty.LAST_GARBAGE_COLLECTION_TIME, timeOfCollection, transaction)
                })
                overwrittenDeployments.forEach(deployment => this.overwrittenDeployments.delete(deployment))
            }
        } catch (error) {
            GarbageCollectionManager.LOGGER.warn(`Failed to perform garbage collection. Reason:\n${error}`)
        } finally {
            if (!this.stopping) {
                this.nextGarbageCollectionTimeout = setTimeout(() => this.performSweep(), this.sweepInterval)
            }
            this.sweeping = false
        }
    }

    deploymentsWereOverwritten(deployments: Set<DeploymentId>) {
        if (this.performGarbageCollection) {
            deployments.forEach(deploymentId => this.overwrittenDeployments.add(deploymentId))
        }
    }

    amountOfOverwrittenDeploymentsSinceLastSweep(): number {
        return this.overwrittenDeployments.size
    }

    private waitUntilSyncFinishes(): Promise<void> {
        return new Promise(async (resolve) => {
            while (this.sweeping === true) {
                await delay(ms('1s'))
            }
            resolve()
        })
    }
}