import { IBaseComponent } from '@well-known-components/interfaces'

/** This process's folder for spooled POST /entities bodies, owned for as long as the process lives. */
export interface IUploadSpool extends IBaseComponent {
  /** Process-unique folder, on node-local disk, that request spools are created in. */
  readonly folder: string
}
