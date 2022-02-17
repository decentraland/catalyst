import fs from 'fs'
import * as fsPromises from 'fs/promises'

export type FSComponent = Pick<typeof fs, 'createReadStream'> &
  Pick<typeof fsPromises, 'access' | 'opendir' | 'stat' | 'unlink' | 'mkdir' | 'open'> & {
    constants: Pick<typeof fs.constants, 'F_OK' | 'R_OK'>
  }

export function createFsComponent(): FSComponent {
  return {
    createReadStream: fs.createReadStream,
    access: fsPromises.access,
    opendir: fsPromises.opendir,
    stat: fsPromises.stat,
    unlink: fsPromises.unlink,
    mkdir: fsPromises.mkdir,
    open: fsPromises.open,
    constants: {
      F_OK: fs.constants.F_OK,
      R_OK: fs.constants.R_OK
    }
  }
}
