import path from 'path'
import { ContentStorage } from './ContentStorage'
import { FileSystemContentStorage } from './FileSystemContentStorage'
import { Environment, EnvironmentConfig } from '../Environment'

export class ContentStorageFactory {
  static local(env: Environment): Promise<ContentStorage> {
    const contentFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
    return FileSystemContentStorage.build(contentFolder)
  }
}
