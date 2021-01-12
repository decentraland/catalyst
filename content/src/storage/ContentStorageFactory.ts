import path from 'path'
import { Environment, EnvironmentConfig } from '../Environment'
import { ContentStorage } from './ContentStorage'
import { FileSystemContentStorage } from './FileSystemContentStorage'
import { S3ContentStorage } from './S3ContentStorage'

export class ContentStorageFactory {
  static create(env: Environment): Promise<ContentStorage> {
    if (this.shouldStoreInS3(env)) {
      return this.s3(env)
    } else {
      return this.local(env)
    }
  }

  static shouldStoreInS3(env: Environment): boolean {
    return (
      !!env.getConfig<string>(EnvironmentConfig.CONTENT_STORAGE) &&
      env.getConfig<string>(EnvironmentConfig.CONTENT_STORAGE).toLowerCase() == 's3' &&
      !!env.getConfig(EnvironmentConfig.S3_STORAGE_ACCESS_KEY_ID) &&
      !!env.getConfig(EnvironmentConfig.S3_STORAGE_SECRET_ACCESS_KEY) &&
      !!env.getConfig(EnvironmentConfig.S3_STORAGE_BUCKET)
    )
  }

  static local(env: Environment): Promise<ContentStorage> {
    const contentFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
    return FileSystemContentStorage.build(contentFolder)
  }

  static s3(env: Environment): Promise<ContentStorage> {
    const accessKeyId: string = env.getConfig(EnvironmentConfig.S3_STORAGE_ACCESS_KEY_ID)
    const secretAccessKey: string = env.getConfig(EnvironmentConfig.S3_STORAGE_SECRET_ACCESS_KEY)
    const bucket: string = env.getConfig(EnvironmentConfig.S3_STORAGE_BUCKET)
    return S3ContentStorage.build(accessKeyId, secretAccessKey, bucket)
  }
}
