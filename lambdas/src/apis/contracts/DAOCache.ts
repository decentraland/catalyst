import { ServerMetadata } from "decentraland-katalyst-commons/ServerMetadata";
import { TimeRefreshedDataHolder } from "./TimeRefreshedDataHolder";
import { DAOContractClient } from "decentraland-katalyst-commons/DAOClient";
import ms from "ms";

const REFRESH_TIME: number = ms('15m')

export class DAOCache {
    private servers: TimeRefreshedDataHolder<Set<ServerMetadata>>

    constructor(daoClient: DAOContractClient) {
        this.servers = new TimeRefreshedDataHolder(() => daoClient.getAllServers(), REFRESH_TIME)
    }

    async getServers(): Promise<Set<ServerMetadata>> {
        return this.servers.get()
    }
}
