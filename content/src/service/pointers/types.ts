import { DeploymentWithAuthChain } from '@dcl/schemas'
import { DeploymentFilters } from '../../service/deployments/types'

export type PointerChangesFilters = Pick<DeploymentFilters, 'from' | 'to' | 'entityTypes'>

export type PointerChange = DeploymentWithAuthChain & { localTimestamp: number }

export type DeploymentPointerChanges = {
  pointerChanges: PointerChange[]
  filters: Omit<PointerChangesFilters, 'entityType'>
  pagination: {
    offset: number
    limit: number
    moreData: boolean
    lastId?: string
    next?: string
  }
}
