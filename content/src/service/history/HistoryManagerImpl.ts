import { Timestamp } from "../time/TimeSorting"
import { HistoryManager, PartialDeploymentLegacyHistory, LegacyDeploymentEvent } from "./HistoryManager"
import { ServerName } from "../naming/NameKeeper"
import { ContentCluster } from "../synchronization/ContentCluster"
import { ServerAddress } from "../synchronization/clients/contentserver/ContentServerClient"
import { DeploymentsRepository } from "@katalyst/content/storage/repositories/DeploymentsRepository"

export class HistoryManagerImpl implements HistoryManager {

    static UNKNOWN_NAME = 'UNKNOWN_NAME'
    private immutableTime: Timestamp = 0
    private historySize: number | undefined

    constructor(private readonly cluster: ContentCluster) { }

    async reportDeployment(deploymentsRepo: DeploymentsRepository): Promise<void> {
        if (!this.historySize) {
            // Since this is called after the deployment is added to the table, there is no need to add one
            this.historySize = await deploymentsRepo.getAmountOfDeployments()
        } else {
            this.historySize++
        }
    }

    getHistorySize(): number {
        return this.historySize ?? 0
    }

    setTimeAsImmutable(immutableTime: number): void {
        this.immutableTime = immutableTime
    }

    getLastImmutableTime(): Timestamp {
        return this.immutableTime
    }

    private static MAX_HISTORY_LIMIT = 500
    private static DEFAULT_HISTORY_LIMIT = 500
    /** Returns the history sorted from newest to oldest */
    async getHistory(deploymentsRepository: DeploymentsRepository, from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number): Promise<PartialDeploymentLegacyHistory> {
        let address: ServerAddress | undefined
        if (serverName) {
            address = this.cluster.getAddressForServerName(serverName)
        }
        const curatedOffset = (offset && offset>=0) ? offset : 0
        const curatedLimit = (limit && limit>0 && limit<=HistoryManagerImpl.MAX_HISTORY_LIMIT) ? limit : HistoryManagerImpl.DEFAULT_HISTORY_LIMIT
        const filters = { fromOriginTimestamp: from, toOriginTimestamp: to, originServerUrl: address }

        const deployments = await deploymentsRepository.getHistoricalDeploymentsByOriginTimestamp(curatedOffset, curatedLimit + 1, filters)
        const moreData = deployments.length > curatedLimit
        const finalDeployments: LegacyDeploymentEvent[] = deployments.slice(0, curatedLimit)
            .map(deployment => ({
                entityType: deployment.entityType,
                entityId: deployment.entityId,
                timestamp: deployment.originTimestamp,
                serverName: this.cluster.getServerNameForAddress(deployment.originServerUrl) ?? 'UNKNOWN_NAME'
            }))

        return {
            events: finalDeployments,
            filters: {
                from: from,
                to: to,
                serverName: serverName
            },
            pagination: {
                offset: curatedOffset,
                limit: curatedLimit,
                moreData: moreData
            }
        }
    }
}
