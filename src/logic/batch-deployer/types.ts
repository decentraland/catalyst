import { IDeployerComponent } from '@dcl/snapshots-fetcher'
import { AuthChain } from '@dcl/schemas'
import { IBaseComponent } from '@well-known-components/interfaces'
import { DeploymentContext, LocalDeploymentAuditInfo } from '../../deployment-types'

/**
 * Extended deployer interface. On top of the `IDeployerComponent` surface required by the
 * sync framework, the batch-deployer also exposes:
 *
 * - `onIdle()` — used by the sync orchestrator to wait for all in-flight deployments to finish.
 * - `deployEntityFromRemoteServer()` and `deployDownloadedEntity()` — the per-entity download-
 *   and-deploy flow used by remote sync paths (in `deployments/component.ts` and inside the
 *   component itself). Folded in from the former `sync-orchestrator/deploy-remote-entity.ts`
 *   so the load-balancing `serverLru` state lives in the factory closure instead of as a
 *   module-level Map.
 */
export type IBatchDeployer = IDeployerComponent &
  IBaseComponent & {
    onIdle(): Promise<void>
    deployEntityFromRemoteServer(
      entityId: string,
      entityType: string,
      authChain: AuthChain,
      servers: string[],
      context: DeploymentContext
    ): Promise<void>
    deployDownloadedEntity(
      entityId: string,
      entityType: string,
      auditInfo: LocalDeploymentAuditInfo,
      context: DeploymentContext
    ): Promise<void>
  }
