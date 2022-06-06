import fs from 'fs'
import * as fsPromises from 'fs/promises'

async function existPath(path: string): Promise<boolean> {
  try {
    await fs.promises.access(path, fs.constants.F_OK | fs.constants.R_OK)
    return true
  } catch (error) {
    return false
  }
}

async function ensureDirectoryExists(directory: string): Promise<void> {
  const alreadyExist = await existPath(directory)
  if (!alreadyExist) {
    try {
      await fs.promises.mkdir(directory, { recursive: true })
    } catch (error) {
      // Ignore these errors
    }
  }
}

export type FSComponent = Pick<typeof fs, 'createReadStream'> &
  Pick<typeof fs, 'createWriteStream'> &
  Pick<typeof fsPromises, 'access' | 'opendir' | 'stat' | 'unlink' | 'mkdir' | 'readdir' | 'readFile'> & {
    constants: Pick<typeof fs.constants, 'F_OK' | 'R_OK'>
    ensureDirectoryExists: (path: string) => Promise<void>
    existPath: (path: string) => Promise<boolean>
  }

export function createFsComponent(): FSComponent {
  return {
    createReadStream: fs.createReadStream,
    createWriteStream: fs.createWriteStream,
    access: fsPromises.access,
    opendir: fsPromises.opendir,
    stat: fsPromises.stat,
    unlink: fsPromises.unlink,
    mkdir: fsPromises.mkdir,
    readdir: fsPromises.readdir,
    readFile: fsPromises.readFile,
    constants: {
      F_OK: fs.constants.F_OK,
      R_OK: fs.constants.R_OK
    },
    ensureDirectoryExists,
    existPath
  }
}
