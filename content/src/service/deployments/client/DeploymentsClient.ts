import { ServerAddress } from "../../synchronization/clients/contentserver/ContentServerClient"
import { FetchHelper } from "@katalyst/content/helpers/FetchHelper"
import { retry } from "@katalyst/content/helpers/RetryHelper";
import { DeploymentFilters, PartialDeploymentHistory, Deployment } from "../DeploymentManager"

export class DeploymentsClient {

    static async consumeAllDeployments(
        fetchHelper: FetchHelper,
        address: ServerAddress,
        filters?: DeploymentFilters,
        limit?: number,
        partialCallback?: (url: string, res: PartialDeploymentHistory) => void)
        : Promise<Deployment[]> {
        let deployments: Deployment[] = []
        let offset = 0
        let keepRetrievingHistory = true
        while(keepRetrievingHistory) {
            let url = `${address}/deployments?offset=${offset}`
            if (filters) {
                for (const [filterName, filterValue] of Object.entries(filters)) {
                    url += `&${filterName}=${filterValue}`
                }
            }
            if (limit) {
                url += `&limit=${limit}`
            }
            const partialHistory: PartialDeploymentHistory = await retry(() => fetchHelper.fetchJson(url), 3, `fetch deployments from ${address}`)
            if (partialCallback) {
                partialCallback(url, partialHistory)
            }
            deployments.push(...partialHistory.deployments)
            offset = partialHistory.pagination.offset + partialHistory.pagination.limit
            keepRetrievingHistory = partialHistory.pagination.moreData
        }
        return deployments
    }
}