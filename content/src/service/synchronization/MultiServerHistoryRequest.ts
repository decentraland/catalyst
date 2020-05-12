import log4js from "log4js"
import { ServerName } from "../naming/NameKeeper";
import { ContentServerClient } from "./clients/contentserver/ContentServerClient";
import { Timestamp } from "../time/TimeSorting";
import { LegacyDeploymentHistory } from "../history/HistoryManager";
import { EventDeployer } from "./EventDeployer";
import { retry } from "@katalyst/content/helpers/FetchHelper";
import { legacyDeploymentEventToDeploymentEventBase } from "./ClusterUtils";
import { ContentCluster } from "./ContentCluster";

/**
 * On some occasions (such as server onboarding) a server might need to make a request to many other servers on the cluster.
 */
export class MultiServerHistoryRequest {

    private static readonly LOGGER = log4js.getLogger('MultiServerHistoryRequest');

    private readonly request: Request

    constructor(private readonly recipients: ContentServerClient[],
                private readonly deployer: EventDeployer,
                private readonly cluster: ContentCluster,
                from: Timestamp,
                serverName?: ServerName,
                to?: Timestamp) {
        this.request = { from, serverName, to }
    }

    /** Execute the request */
    async execute(): Promise<void> {
        const legacyHistories: LegacyDeploymentHistory[] = await Promise.all(this.recipients
            .map(recipient => this.executeRequestOn(recipient)))

        const histories = legacyHistories.map(history => history.map(event => legacyDeploymentEventToDeploymentEventBase(this.cluster, event)))

        try {
            await this.deployer.deployHistories(histories, { logging: true })
        } catch (error) {
            MultiServerHistoryRequest.LOGGER.error(`Failed to deploy histories. Reason:\n${error}`)
        }
    }

    /** Execute the request on one server */
    private async executeRequestOn(server: ContentServerClient): Promise<LegacyDeploymentHistory> {
        try {
            return await retry(() => server.getHistory(this.request.from, this.request.serverName, this.request.to), 5, `fetch history from server ${server.getName()}`, '5s')
        } catch (error) {
            MultiServerHistoryRequest.LOGGER.error(`Failed to execute multi server request on ${server.getName()}. Reason:\n${error}`)
            return []
        }
    }
}

type Request = {
    from: Timestamp,
    serverName?: ServerName,
    to?: Timestamp,
}

