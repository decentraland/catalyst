import { DeploymentId } from '../../types'

export type DeploymentResult = Map<string, { before: DeploymentId | undefined; after: DELTA_POINTER_RESULT }>

export enum DELTA_POINTER_RESULT {
  SET = 'set',
  CLEARED = 'cleared'
}
