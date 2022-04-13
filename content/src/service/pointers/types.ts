import { DeploymentFilters } from 'dcl-catalyst-commons'
import { DeploymentWithAuthChain } from '../../logic/database-queries/snapshots-queries'

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
