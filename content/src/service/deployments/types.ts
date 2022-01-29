import { DeploymentFilters, DeploymentSorting } from 'dcl-catalyst-commons'
import { DeploymentField } from '../../controller/Controller'

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
} & DeploymentRequestOptions
