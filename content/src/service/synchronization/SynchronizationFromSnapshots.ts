import { downloadEntities } from '@dcl/snapshots-fetcher'
import { IFetchComponent } from '@well-known-components/http-server'
import { EntityType } from 'dcl-catalyst-commons'
import * as nodeFetch from 'node-fetch'
import { ContentCluster } from './ContentCluster'
import { EventDeployer } from './EventDeployer'

export async function bootstrapFromSnapshots(
  cluster: ContentCluster,
  deployer: EventDeployer,
  contentStorageFolder: string
) {
  await downloadEntities({
    catalystServers: cluster.getAllServersInCluster().map((server) => server.getContentUrl()),
    contentFolder: contentStorageFolder,
    concurrency: 1,
    jobTimeout: 300000,
    entityTypes: [EntityType.PROFILE, EntityType.WEARABLE, EntityType.SCENE],
    components: { fetcher: createFetchComponent() },
    deployAction: async (entity) => console.log(`Deploying ${entity}`),
    isEntityPresentLocally: async (entity) => false
  })
}

export function createFetchComponent() {
  const fetch: IFetchComponent = {
    async fetch(url: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit): Promise<nodeFetch.Response> {
      return nodeFetch.default(url, init)
    }
  }

  return fetch
}
