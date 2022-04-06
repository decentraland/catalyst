import { ensureDirectoryExists, existPath } from '@dcl/catalyst-node-commons'
import fs from 'fs'
import * as fsPromises from 'fs/promises'

export type FSComponent = Pick<typeof fs, 'createReadStream'> &
  Pick<typeof fs, 'createWriteStream'> &
  Pick<typeof fsPromises, 'access' | 'opendir' | 'open' | 'stat' | 'unlink' | 'mkdir' | 'readdir' | 'readFile'> & {
    constants: Pick<typeof fs.constants, 'F_OK' | 'R_OK' | 'O_RDONLY'>
    ensureDirectoryExists: typeof ensureDirectoryExists
    existPath: typeof existPath
  }

export function createFsComponent(): FSComponent {
  return {
    createReadStream: fs.createReadStream,
    createWriteStream: fs.createWriteStream,
    access: fsPromises.access,
    opendir: fsPromises.opendir,
    open: fsPromises.open,
    stat: fsPromises.stat,
    unlink: fsPromises.unlink,
    mkdir: fsPromises.mkdir,
    readdir: fsPromises.readdir,
    readFile: fsPromises.readFile,
    constants: {
      F_OK: fs.constants.F_OK,
      R_OK: fs.constants.R_OK,
      O_RDONLY: fs.constants.O_RDONLY
    },
    ensureDirectoryExists: ensureDirectoryExists,
    existPath: existPath
  }
}
