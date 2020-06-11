import { ServerName, Timestamp } from "dcl-catalyst-commons";
import { ClusterEvent } from "./ClusterEvent";
import { ContentServerClient } from "../clients/contentserver/ContentServerClient";

export class DAORemovalEvent extends ClusterEvent<DAORemoval> { }

export type DAORemoval = {
    serverRemoved: ServerName,
    estimatedLocalImmutableTime: Timestamp,
    remainingServers: ContentServerClient[],
}