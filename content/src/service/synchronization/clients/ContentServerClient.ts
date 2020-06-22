import log4js from 'log4js'
import { Timestamp, ContentFile, ContentFileHash, Deployment as ControllerDeployment, ServerAddress, Fetcher, DeploymentWithAuditInfo } from "dcl-catalyst-commons";
import { ContentClient, DeploymentFields } from "dcl-catalyst-client";

export class ContentServerClient {

    private static readonly LOGGER = log4js.getLogger('ContentServerClient');
    private readonly client: ContentClient
    private connectionState: ConnectionState = ConnectionState.NEVER_REACHED

    constructor(private readonly address: ServerAddress,
        private lastLocalDeploymentTimestamp: Timestamp,
        fetcher: Fetcher) {
            this.client = new ContentClient(address, '', fetcher)
        }

    /**
     * After entities have been deployed (or set as failed deployments), we can finally update the last deployment timestamp.
     */
    updateLastLocalDeploymentTimestamp(timestamp: Timestamp): void {
        this.lastLocalDeploymentTimestamp = Math.max(this.lastLocalDeploymentTimestamp, timestamp);
    }

    /** Return all new deployments, and store the local timestamp of the newest one. */
    async getNewDeployments(): Promise<DeploymentWithAuditInfo[]> {
        try {
            // Fetch the deployments
            const deployments: ControllerDeployment[] = await this.client.fetchAllDeployments({ fromLocalTimestamp: this.lastLocalDeploymentTimestamp + 1 }, DeploymentFields.POINTERS_CONTENT_METADATA_AND_AUDIT_INFO)

             // Update connection state
             if (this.connectionState !== ConnectionState.CONNECTED) {
                ContentServerClient.LOGGER.info(`Could connect to '${this.address}'`)
            }
            this.connectionState = ConnectionState.CONNECTED

            // Keep only values that are used for sync
            return deployments.map(({ entityType, entityId, entityTimestamp, deployedBy, auditInfo }) => {
                delete auditInfo.denylistedContent
                delete auditInfo.isDenylisted
                return { entityType, entityId, entityTimestamp, deployedBy, auditInfo }
            })
        } catch (error) {
            if (this.connectionState === ConnectionState.CONNECTED) {
                this.connectionState = ConnectionState.CONNECTION_LOST
                ContentServerClient.LOGGER.info(`Lost connection to '${this.address}'`)
            }
            ContentServerClient.LOGGER.error(`Failed to get new entities from content server '${this.getAddress()}'\n${error}`)
            return []
        }
    }

    async getContentFile(fileHash: ContentFileHash): Promise<ContentFile> {
        const content = await this.client.downloadContent(fileHash, { attempts: 3, waitTime: '0.5s' })
        return { name: fileHash, content }
    }

    getAddress(): ServerAddress {
        return this.address
    }

    getConnectionState(): ConnectionState {
        return this.connectionState;
    }

    getLastLocalDeploymentTimestamp() {
        return this.lastLocalDeploymentTimestamp
    }
}

export enum ConnectionState {
    CONNECTED = "Connected",
    CONNECTION_LOST = "Connection lost",
    NEVER_REACHED = "Could never be reached",
}
