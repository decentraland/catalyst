import fs from 'fs'
import * as fsPromises from 'fs/promises'

export type FSComponent = Pick<typeof fs, 'createReadStream'> &
  Pick<typeof fsPromises, 'access' | 'opendir' | 'stat' | 'unlink' | 'mkdir'>

export function createFsComponent(): FSComponent {
  return {
    createReadStream: fs.createReadStream,
    access: fsPromises.access,
    opendir: fsPromises.opendir,
    stat: fsPromises.stat,
    unlink: fsPromises.unlink,
    mkdir: fsPromises.mkdir
  }
}
