import { ContentAPI, DeploymentData, DeploymentFields } from 'dcl-catalyst-client'
import { ContentFileHash, Deployment, EntityId } from 'dcl-catalyst-commons'

export async function downloadDeployment(allServers: ContentAPI[], entityId: EntityId): Promise<DeploymentData> {
  // Get the deployment
  const deployment: Deployment = await tryOnMany(allServers, async (server) => {
    const deployments = await server.fetchAllDeployments({
      filters: { entityIds: [entityId] },
      fields: DeploymentFields.POINTERS_CONTENT_METADATA_AND_AUDIT_INFO
    })
    if (deployments.length == 0) {
      throw new Error()
    } // Fail if deployment was not found
    return deployments[0]
  })

  // Get all files to download
  const hashes = deployment.content ? [entityId, ...deployment.content.map(({ hash }) => hash)] : [entityId]

  // Download all entity's files
  const downloadedFiles: Map<ContentFileHash, Buffer> = await downloadAllFiles(allServers, hashes)
  const files: Map<ContentFileHash, { name: string; content: Buffer }> = new Map(
    [...downloadedFiles].map(([hash, buffer]) => [hash, { name: hash, content: buffer }])
  )
  return { entityId, authChain: deployment.auditInfo.authChain, files }
}

export async function downloadAllFiles(
  allServers: ContentAPI[],
  hashes: ContentFileHash[]
): Promise<Map<string, Buffer>> {
  const files: Map<string, Buffer> = new Map()
  for (const hash of hashes) {
    const buffer = await tryOnMany(allServers, (server) => server.downloadContent(hash))
    files.set(hash, buffer)
  }
  return files
}

export async function tryOnMany<T>(servers: ContentAPI[], action: (server: ContentAPI) => Promise<T>): Promise<T> {
  for (const server of servers) {
    try {
      return await action(server)
    } catch {}
  }
  throw new Error(`Failed to execute on all servers`)
}
