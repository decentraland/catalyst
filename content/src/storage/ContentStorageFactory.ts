import path from 'path'
import { Environment, EnvironmentConfig } from '../Environment'
import { FileSystemContentStorage } from './FileSystemContentStorage'

export class ContentStorageFactory {
  static local(env: Environment): Promise<FileSystemContentStorage> {
    const contentFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
    return FileSystemContentStorage.build(contentFolder)
  }
}
