import { IBaseComponent } from '@well-known-components/interfaces'

/** This process's folder for spooled POST /entities bodies, owned for as long as the process lives. */
export interface IUploadSpool extends IBaseComponent {
  /** Process-unique folder that request spools are created in. */
  readonly folder: string
}

export type UploadSpoolOptions = {
  /** How often the lease is renewed, in milliseconds. */
  heartbeatMs?: number
  /** How long an unrenewed lease keeps another process's folder from being reclaimed, in milliseconds. */
  leaseTtlMs?: number
}
