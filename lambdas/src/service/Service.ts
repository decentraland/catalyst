import { HealthStatus } from '../utils/health'

/**
 * This version of the service can tell clients about the status of the base Lambdas Service.
 */
export interface LambdasService {
  getStatus(): Promise<ServerStatus>
  getHealth(): Promise<Record<string, HealthStatus>>
}

export type Timestamp = number

export type ServerVersion = string

export type ServerStatus = {
  version: ServerVersion
  currentTime: Timestamp
}
