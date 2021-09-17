import { ContentClient, DeploymentFields, DeploymentWithMetadataContentAndPointers } from 'dcl-catalyst-client'
import {
  ContentFileHash,
  DeploymentWithAuditInfo,
  Fetcher,
  ServerAddress,
  SortingField,
  SortingOrder,
  Timestamp
} from 'dcl-catalyst-commons'
import log4js from 'log4js'

export class ContentServerClient {
  private static readonly LOGGER = log4js.getLogger('ContentServerClient')
  private readonly client: ContentClient
  private connectionState: ConnectionState = ConnectionState.NEVER_REACHED
  private potentialLocalDeploymentTimestamp: Timestamp | undefined

  constructor(
    private readonly address: ServerAddress,
    private lastLocalDeploymentTimestamp: Timestamp,
    fetcher: Fetcher,
    proofOfWorkEnabled: boolean
  ) {
    this.client = new ContentClient({ contentUrl: address, proofOfWorkEnabled, fetcher })
  }

  /**
   * After entities have been deployed (or set as failed deployments), we can finally update the last deployment timestamp.
   */
  deploymentsSuccessful(deployment: DeploymentWithAuditInfo): Timestamp {
    this.potentialLocalDeploymentTimestamp = Math.max(
      this.potentialLocalDeploymentTimestamp || 0,
      deployment.entityTimestamp
    )
    return (this.lastLocalDeploymentTimestamp = Math.max(
      this.lastLocalDeploymentTimestamp,
      this.potentialLocalDeploymentTimestamp ?? 0
    ))
  }

  /** Return all new deployments, and store the local timestamp of the newest one. */
  async *getNewDeployments(): AsyncIterable<DeploymentWithMetadataContentAndPointers & DeploymentWithAuditInfo> {
    // Fetch the deployments
    const iterator: AsyncIterable<DeploymentWithMetadataContentAndPointers & DeploymentWithAuditInfo> = (
      this.client as any
    ).iterateThroughDeployments(
      {
        filters: { from: this.lastLocalDeploymentTimestamp + 1 },
        fields: DeploymentFields.AUDIT_INFO,
        errorListener: (errorMessage) => {
          ContentServerClient.LOGGER.error(
            `Failed to get new entities from content server '${this.getAddress()}'\n${errorMessage}`
          )
          // this throw is important!!!!!! it breaks the iterator preventing hanging forever
          throw errorMessage
        },
        sortBy: {
          field: SortingField.ENTITY_TIMESTAMP,
          order: SortingOrder.ASCENDING
        }
      },
      { timeout: '20s' }
    )

    try {
      for await (const it of iterator) {
        this.connectionState = ConnectionState.CONNECTED
        yield it
      }
    } catch (error) {
      ContentServerClient.LOGGER.error(error)
      // Update connection state
      this.connectionState = ConnectionState.CONNECTION_LOST
    }
  }

  getContentFile(fileHash: ContentFileHash): Promise<Buffer> {
    return this.client.downloadContent(fileHash, { attempts: 3, waitTime: '0.5s' })
  }

  getAddress(): ServerAddress {
    return this.address
  }

  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  getLastLocalDeploymentTimestamp() {
    return this.lastLocalDeploymentTimestamp
  }

  getPotentialLocalDeploymentTimestamp() {
    return this.potentialLocalDeploymentTimestamp
  }
}

export enum ConnectionState {
  CONNECTED = 'Connected',
  CONNECTION_LOST = 'Connection lost',
  NEVER_REACHED = 'Could never be reached'
}
