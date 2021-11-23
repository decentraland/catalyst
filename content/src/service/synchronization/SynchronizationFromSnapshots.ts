import { createCatalystDeploymentStream } from '@dcl/snapshots-fetcher'
import { IFetchComponent } from '@well-known-components/http-server'
import { EntityType, Timestamp } from 'dcl-catalyst-commons'
import * as nodeFetch from 'node-fetch'
import { FailureReason } from '../errors/FailedDeploymentsManager'
import { DeploymentResult } from '../Service'
import { ContentCluster } from './ContentCluster'
import { EventDeployer } from './EventDeployer'

type ContentUrl = string

export async function bootstrapFromSnapshots(
  cluster: ContentCluster,
  deployer: EventDeployer,
  contentStorageFolder: string
): Promise<Map<ContentUrl, Timestamp>> {
  await downloadEntities({
    catalystServers: cluster.getAllServersInCluster().map((server) => server.getContentUrl()),
    contentFolder: contentStorageFolder,
    concurrency: 1,
    jobTimeout: 300000,
    entityTypes: [EntityType.PROFILE, EntityType.WEARABLE, EntityType.SCENE],
    components: { fetcher: createFetchComponent() },
    deployAction: async (entity) => {
      console.log(`Deploying entity ${entity.entityId} (${entity.entityType})`)
      let deploymentResult: DeploymentResult = { errors: ['error'] }
      try {
        deploymentResult = await deployer.deployEntityFromLocalDisk(
          entity.entityId,
          entity.auditInfo,
          contentStorageFolder
        )
      } finally {
        if (typeof deploymentResult !== 'number') {
          await this.reportError({
            // TODO: add entity type
            deployment: { entityType: 'UNKNOWN', id: entity.entityId },
            reason: FailureReason.DEPLOYMENT_ERROR
          })
        }
      }
    },
    isEntityPresentLocally: async (entity) => false
  })
  return new Map()
}

export function createFetchComponent() {
  const fetch: IFetchComponent = {
    async fetch(url: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit): Promise<nodeFetch.Response> {
      return nodeFetch.default(url, init)
    }
  }
  return fetch
}
