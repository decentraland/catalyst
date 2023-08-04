import { AuthChain, EntityType, EthAddress } from '@dcl/schemas'
import { EntityVersion, DeploymentField } from './types.js'

export type DeploymentFilters = {
  from?: number
  to?: number
  deployedBy?: EthAddress[]
  entityTypes?: EntityType[]
  entityIds?: string[]
  pointers?: string[]
  onlyCurrentlyPointed?: boolean
}

export enum SortingField {
  LOCAL_TIMESTAMP = 'local_timestamp',
  ENTITY_TIMESTAMP = 'entity_timestamp'
}

export enum SortingOrder {
  ASCENDING = 'ASC',
  DESCENDING = 'DESC'
}

export type DeploymentSorting = {
  field?: SortingField
  order?: SortingOrder
}

interface DeploymentRequestOptions {
  filters?: DeploymentFilters
  sortBy?: DeploymentSorting
  offset?: number
  limit?: number
  lastId?: string
}

export type PointerChangesOptions = {
  includeAuthChain?: boolean
} & DeploymentRequestOptions

export type DeploymentOptions = {
  fields?: DeploymentField[]
  includeDenylisted?: boolean
} & DeploymentRequestOptions

export type DeploymentBase = {
  entityVersion: EntityVersion
  entityType: EntityType
  entityId: string
  entityTimestamp: number
  deployedBy: EthAddress
}

export type DeploymentContent = {
  key: string
  hash: string
}

export type AuditInfo = {
  version: EntityVersion
  authChain: AuthChain
  localTimestamp: number
  overwrittenBy?: string
  isDenylisted?: boolean
  denylistedContent?: string[]
}

export type Deployment = DeploymentBase & {
  pointers: string[]
  content?: DeploymentContent[]
  metadata?: any
  auditInfo: AuditInfo
}

export type PartialDeploymentHistory<T extends DeploymentBase> = {
  deployments: T[]
  filters: DeploymentFilters
  pagination: {
    offset: number
    limit: number
    moreData: boolean
    next?: string
    lastId?: string
  }
}

export type LocalDeploymentAuditInfo = Pick<AuditInfo, 'authChain'>

export type InvalidResult = { errors: string[] }
export function InvalidResult(val: InvalidResult): InvalidResult {
  return val
}

export type DeploymentResult = number | InvalidResult

export type DeploymentFiles = Uint8Array[] | Map<string, Uint8Array>

export function isSuccessfulDeployment(deploymentResult: DeploymentResult): deploymentResult is number {
  return typeof deploymentResult === 'number'
}

export function isInvalidDeployment(deploymentResult: any): deploymentResult is InvalidResult {
  if (deploymentResult && typeof deploymentResult === 'object' && Array.isArray(deploymentResult['errors'])) {
    return true
  }

  return false
}

export enum DeploymentContext {
  LOCAL = 'LOCAL',
  SYNCED = 'SYNCED',
  SYNCED_LEGACY_ENTITY = 'SYNCED_LEGACY_ENTITY',
  FIX_ATTEMPT = 'FIX_ATTEMPT'
}
