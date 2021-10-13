import { ContentClient, DeploymentFields } from 'dcl-catalyst-client'
import {
  ContentFileHash,
  Deployment,
  DeploymentWithAuditInfo,
  Fetcher,
  ServerAddress,
  Timestamp
} from 'dcl-catalyst-commons'
import log4js from 'log4js'
import { Readable } from 'stream'
import { passThrough } from '../streaming/StreamHelper'

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
  allDeploymentsWereSuccessful(): Timestamp {
    return (this.lastLocalDeploymentTimestamp = Math.max(
      this.lastLocalDeploymentTimestamp,
      this.potentialLocalDeploymentTimestamp ?? 0
    ))
  }

  /** Return all new deployments, and store the local timestamp of the newest one. */
  getNewDeployments(): Readable {
    let error = false

    // Fetch the deployments
    const stream = this.client.streamAllDeployments(
      {
        filters: { from: this.lastLocalDeploymentTimestamp + 1 },
        fields: DeploymentFields.AUDIT_INFO,
        errorListener: (errorMessage) => {
          error = true
          ContentServerClient.LOGGER.error(
            `Failed to get new entities from content server '${this.getAddress()}'\n${errorMessage}`
          )
        }
      },
      { timeout: '20s' }
    )

    // Listen to all deployments passing through, and store the newest one's timestamps
    const passTrough = passThrough(
      (deployment: DeploymentWithAuditInfo) =>
        (this.potentialLocalDeploymentTimestamp = Math.max(
          this.potentialLocalDeploymentTimestamp ?? 0,
          deployment.auditInfo.localTimestamp
        ))
    )

    // Wait for stream to end to update connection state
    stream.once('end', () => {
      if (!error) {
        // Update connection state
        if (this.connectionState !== ConnectionState.CONNECTED) {
          ContentServerClient.LOGGER.info(`Could connect to '${this.address}'`)
        }
        this.connectionState = ConnectionState.CONNECTED
      } else {
        // Update connection state
        if (this.connectionState === ConnectionState.CONNECTED) {
          this.connectionState = ConnectionState.CONNECTION_LOST
        }
        this.potentialLocalDeploymentTimestamp = undefined
      }
    })

    return stream.pipe(passTrough)
  }

  /** Return all new deployments, and store the local timestamp of the newest one. */
  async getDeployment(entityId: string): Promise<Deployment[]> {
    // Fetch the deployments
    return this.client.fetchAllDeployments({
      filters: { entityIds: [entityId] },
      fields: DeploymentFields.POINTERS_CONTENT_METADATA_AND_AUDIT_INFO
    })
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
}

export enum ConnectionState {
  CONNECTED = 'Connected',
  CONNECTION_LOST = 'Connection lost',
  NEVER_REACHED = 'Could never be reached'
}
