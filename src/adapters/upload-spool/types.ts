import { IBaseComponent } from '@well-known-components/interfaces'

/** This process's folder for spooled POST /entities bodies, owned for as long as the process lives. */
export interface IUploadSpool extends IBaseComponent {
  /** Process-unique folder, on node-local disk, that request spools are created in. */
  readonly folder: string
  /**
   * Creates a request's spool folder inside `folder`, first restoring the process folder, its marker
   * and its owner socket if a temp-folder cleaner removed them.
   * @returns The new request folder's path.
   * @throws UploadSpoolStoppedError once the spool has begun stopping.
   */
  createRequestFolder(): Promise<string>
}
