import { DeploymentData } from 'dcl-catalyst-client'
import { ContentFileHash, Deployment, EntityId } from 'dcl-catalyst-commons'
import { ContentServerClient } from '../clients/ContentServerClient'

export async function downloadDeployment(
  allClients: ContentServerClient[],
  entityId: EntityId
): Promise<DeploymentData> {
  // Get the deployment
  const deployment: Deployment = await tryOnMany(allClients, async (client) => {
    const deployments = await client.getDeployment(entityId)
    if (deployments.length == 0) {
      throw new Error()
    } // Fail if deployment was not found
    return deployments[0]
  })

  // Get all files to download
  const hashes = deployment.content ? [entityId, ...deployment.content.map(({ hash }) => hash)] : [entityId]

  // Download all entity's files
  const downloadedFiles: Map<ContentFileHash, Buffer> = await downloadAllFiles(allClients, hashes)

  return { entityId, authChain: deployment.auditInfo.authChain, files: downloadedFiles }
}

async function downloadAllFiles(
  clients: ContentServerClient[],
  hashes: ContentFileHash[]
): Promise<Map<string, Buffer>> {
  const files: Map<string, Buffer> = new Map()
  for (const hash of hashes) {
    const buffer = await tryOnMany(clients, (client) => client.getContentFile(hash))
    files.set(hash, buffer)
  }
  return files
}

async function tryOnMany<T>(
  clients: ContentServerClient[],
  action: (server: ContentServerClient) => Promise<T>
): Promise<T> {
  for (const server of clients) {
    try {
      return await action(server)
    } catch {}
  }
  throw new Error(`Failed to execute on all servers`)
}
