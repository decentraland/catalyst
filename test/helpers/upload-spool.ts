import { mkdtemp } from 'fs/promises'
import path from 'path'
import { IUploadSpool } from '../../src/adapters/upload-spool'

/** A spool creating request folders under `folder`, for the multipart wrapper's tests. */
export function spoolIn(folder: string): Pick<IUploadSpool, 'createRequestFolder'> {
  return { createRequestFolder: () => mkdtemp(path.join(folder, 'upload-')) }
}
