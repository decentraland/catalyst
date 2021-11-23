import { downloadEntityAndContentFiles, getDeployedEntitiesStream } from '@dcl/snapshots-fetcher'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { RemoteEntityDeployment, SnapshotsFetcherComponents } from '@dcl/snapshots-fetcher/dist/types'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { IFetchComponent } from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { EntityType, Timestamp } from 'dcl-catalyst-commons'
import * as nodeFetch from 'node-fetch'
import { FailureReason } from '../errors/FailedDeploymentsManager'
import { DeploymentResult } from '../Service'
import { ContentServerClient } from './clients/ContentServerClient'
import { ContentCluster } from './ContentCluster'
import { EventDeployer } from './EventDeployer'

type ContentUrl = string

export function createSincronizationComponents(): SnapshotsFetcherComponents {
  const logger = createLogComponent()
  const fetcher = createFetchComponent()

  const downloadQueue = createJobQueue({
    autoStart: true,
    concurrency: 10,
    timeout: 60000
  })

  return {
    logger,
    downloadQueue,
    fetcher
  }
}

export async function bootstrapFromSnapshots(
  cluster: ContentCluster,
  deployer: EventDeployer,
  contentStorageFolder: string
): Promise<Map<ContentUrl, Timestamp>> {
  const catalystServers = await ensureListOfCatalysts(cluster, 10 /* retries */, 1000 /* wait time */)

  if (catalystServers.length == 0) return new Map()

  const components = createSincronizationComponents()
  const requestMaxRetries = 10
  const requestRetryWaitTime = 1000

  const parallelDeploymentJobs = createJobQueue({
    autoStart: true,
    concurrency: 10,
    timeout: 100000
  })

  // accumulator of all deployments
  const deploymentsMap = new Map<
    string,
    {
      entity: RemoteEntityDeployment
      servers: string[]
    }
  >()

  // this is used for loadbalancing servers
  const serverLru = new Map<string, number>()

  // wait to get all the bootstrap data from all servers
  await Promise.allSettled(
    catalystServers.map(async (server) => {
      const stream = getDeployedEntitiesStream(components, {
        contentFolder: contentStorageFolder,
        contentServer: server.getContentUrl(),
        pointerChangesWaitTime: 0, // zero to not restart the timer
        requestMaxRetries,
        requestRetryWaitTime,
        fromTimestamp: 0
      })
      for await (const entity of stream) {
        let elementInMap = deploymentsMap.get(entity.entityId)
        if (!elementInMap) {
          elementInMap = {
            entity,
            servers: [server.getContentUrl()]
          }
          deploymentsMap.set(entity.entityId, elementInMap)

          parallelDeploymentJobs.scheduleJobWithRetries(async () => {
            console.log(`Downloading entity ${entity.entityId} (${entity.entityType})`)

            await downloadEntityAndContentFiles(
              components,
              entity.entityId,
              elementInMap!.servers,
              serverLru,
              contentStorageFolder,
              requestMaxRetries,
              requestRetryWaitTime
            )

            console.log(`Deploying entity ${entity.entityId} (${entity.entityType})`)

            let deploymentResult: DeploymentResult = { errors: ['error'] }

            try {
              deploymentResult = await deployer.deployEntityFromLocalDisk(
                entity.entityId,
                entity.authChain,
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
          }, 10)
        } else {
          if (!elementInMap.servers.includes(server.getContentUrl())) {
            elementInMap.servers.push(server.getContentUrl())
          }
        }
      }
    })
  )

  // await getDeployedEntitiesStream({
  //   catalystServers: cluster.getAllServersInCluster().map((server) => server.getContentUrl()),
  //   contentFolder: contentStorageFolder,
  //     console.log(`Deploying entity ${entity.entityId} (${entity.entityType})`)
  //     let deploymentResult: DeploymentResult = { errors: ['error'] }
  //     try {
  //       deploymentResult = await deployer.deployEntityFromLocalDisk(
  //         entity.entityId,
  //         entity.auditInfo,
  //         contentStorageFolder
  //       )
  //     } finally {
  //       if (typeof deploymentResult !== 'number') {
  //         await this.reportError({
  //           // TODO: add entity type
  //           deployment: { entityType: 'UNKNOWN', id: entity.entityId },
  //           reason: FailureReason.DEPLOYMENT_ERROR
  //         })
  //       }
  //     }
  //   },
  //   isEntityPresentLocally: async (entity) => false
  // })
  return new Map()
}

export async function ensureListOfCatalysts(
  cluster: ContentCluster,
  maxRetries: number,
  waitTime: number = 1000
): Promise<ContentServerClient[]> {
  let i = 0

  // iterate until we have a list of catalysts
  while (i++ < maxRetries) {
    const servers = cluster.getAllServersInCluster()

    if (servers.length) {
      return servers
    }

    await sleep(waitTime)
  }

  return []
}

export function createFetchComponent() {
  const fetch: IFetchComponent = {
    async fetch(url: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit): Promise<nodeFetch.Response> {
      return nodeFetch.default(url, init)
    }
  }
  return fetch
}
