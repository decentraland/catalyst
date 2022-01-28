/**
 * This file should only do two things:
 *   1) Download a remote entity
 *   2) Deploy the downloaded entity locally
 */

import { downloadEntityAndContentFiles } from '@dcl/snapshots-fetcher'
import { AuthChain } from 'dcl-crypto'
import * as fs from 'fs'
import * as path from 'path'
import { AppComponents } from '../../types'
import { DeploymentContext, LocalDeploymentAuditInfo } from '../Service'

const requestMaxRetries = 10
const requestRetryWaitTime = 1000

// this is used for loadbalancing servers
const serverLru = new Map<string, number>()

/**
 * This function downloads an entity from a remote catalyst(s) and deploys the entity locally.
 */
export async function deployEntityFromRemoteServer(
  components: Pick<
    AppComponents,
    'metrics' | 'staticConfigs' | 'fetcher' | 'downloadQueue' | 'logs' | 'deployer' | 'storage'
  >,
  entityId: string,
  entityType: string,
  authChain: AuthChain,
  servers: string[],
  kind: DeploymentContext
): Promise<void> {
  await downloadFullEntity(components, entityId, entityType, servers)
  await deployDownloadedEntity(components, entityId, entityType, { authChain }, kind)
}

async function downloadFullEntity(
  components: Pick<AppComponents, 'metrics' | 'staticConfigs' | 'fetcher' | 'storage'>,
  entityId: string,
  entityType: string,
  servers: string[]
): Promise<unknown> {
  const { metrics } = components
  metrics.increment('dcl_pending_download_gauge', { entity_type: entityType })
  try {
    return await downloadEntityAndContentFiles(
      components,
      entityId,
      servers,
      serverLru,
      path.join(components.staticConfigs.contentStorageFolder, '_tmp'),
      requestMaxRetries,
      requestRetryWaitTime
    )
  } finally {
    metrics.decrement('dcl_pending_download_gauge', { entity_type: entityType })
  }
}

export async function deployDownloadedEntity(
  components: Pick<AppComponents, 'metrics' | 'staticConfigs' | 'deployer'>,
  entityId: string,
  entityType: string,
  auditInfo: LocalDeploymentAuditInfo,
  kind: DeploymentContext
): Promise<void> {
  const { metrics } = components
  const deploymentTimeTimer = metrics.startTimer('dcl_deployment_time', { entity_type: entityType })

  try {
    const entityFile = await fs.promises.readFile(path.join(components.staticConfigs.contentStorageFolder, entityId))

    if (entityFile.length == 0) {
      throw new Error('Trying to deploy empty entityFile')
    }

    const deploymentResult = await components.deployer.deployEntity([entityFile], entityId, auditInfo, kind)
    if (typeof deploymentResult === 'object' && deploymentResult.errors && deploymentResult.errors.length > 0) {
      throw new Error(
        `Errors deploying entity(${entityId}):\n${deploymentResult.errors.map(($) => ' - ' + $).join('\n')}`
      )
    }

    deploymentTimeTimer.end({ failed: 'false' })
  } catch (err: any) {
    deploymentTimeTimer.end({ failed: 'true' })
    throw err
  }
}
