import { Timestamp } from "../../time/TimeSorting"
import { ServerName } from "../../naming/NameKeeper"
import { DeploymentEvent, PartialDeploymentHistory } from "../HistoryManager"
import { ServerAddress } from "../../synchronization/clients/contentserver/ContentServerClient"
import { FetchHelper } from "@katalyst/content/helpers/FetchHelper"

export class HistoryClient {

    static async consumeAllHistory(
        fetchHelper: FetchHelper,
        address: ServerAddress,
        from?: Timestamp,
        to?: Timestamp,
        serverName?: ServerName,
        limit?: number,
        partialCallback?: (url: string, res:PartialDeploymentHistory) => void )
        : Promise<DeploymentEvent[]> {
        let events: DeploymentEvent[] = []
        let offset = 0
        let keepRetrievingHistory = true
        while(keepRetrievingHistory) {
            let url = `${address}/history?offset=${offset}`
            if (from) {
                url += `&from=${from}`
            }
            if (to) {
                url += `&to=${to}`
            }
            if (serverName) {
                url += `&serverName=${serverName}`
            }
            if (limit) {
                url += `&limit=${limit}`
            }
            const partialHistory: PartialDeploymentHistory = await fetchHelper.fetchJson(url)
            if (partialCallback) {
                partialCallback(url, partialHistory)
            }
            events.push(...partialHistory.events)
            offset = partialHistory.pagination.offset + partialHistory.pagination.limit
            keepRetrievingHistory = partialHistory.pagination.moreData
        }
        return events
    }
}