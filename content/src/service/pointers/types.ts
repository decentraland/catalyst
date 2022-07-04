import { DeploymentWithAuthChain } from '@dcl/schemas'
import { DeploymentFilters } from '../deployments/types'

export type PointerChangesFilters = Pick<DeploymentFilters, 'from' | 'to' | 'entityTypes'>

export type DeploymentPointerChanges = {
  pointerChanges: DeploymentWithAuthChain[]
  filters: Omit<PointerChangesFilters, 'entityType'>
  pagination: {
    offset: number
    limit: number
    moreData: boolean
    lastId?: string
    next?: string
  }
}
