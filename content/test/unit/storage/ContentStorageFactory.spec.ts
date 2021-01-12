import { Environment, EnvironmentConfig } from '@katalyst/content/Environment'
import { ContentStorageFactory } from '@katalyst/content/storage/ContentStorageFactory'
import { FileSystemContentStorage } from '@katalyst/content/storage/FileSystemContentStorage'
import { S3ContentStorage } from '@katalyst/content/storage/S3ContentStorage'

describe('ContentStorageFactory', () => {
  it(`When no config for s3 is set, Then it is stored local`, async () => {
    const env: Environment = new Environment()
    env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, 'content')

    const contentStorage = await ContentStorageFactory.create(env)

    expect(contentStorage instanceof FileSystemContentStorage).toBeTruthy()
  })

  it(`Given an incomplete s3 bucket configuration, Then it is stored local`, async () => {
    const env: Environment = new Environment()
    env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, 'content')
    env.setConfig(EnvironmentConfig.S3_STORAGE_ACCESS_KEY_ID, 'access_key_id')
    env.setConfig(EnvironmentConfig.S3_STORAGE_SECRET_ACCESS_KEY, 'access_key')

    const contentStorage = await ContentStorageFactory.create(env)

    expect(contentStorage instanceof FileSystemContentStorage).toBeTruthy()
  })

  it(`Given a s3 complete configuration, Then it is stored in s3`, async () => {
    const env: Environment = new Environment()
    env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, 'content')
    env.setConfig(EnvironmentConfig.S3_STORAGE_ACCESS_KEY_ID, 'access_key_id')
    env.setConfig(EnvironmentConfig.S3_STORAGE_SECRET_ACCESS_KEY, 'access_key')
    env.setConfig(EnvironmentConfig.S3_STORAGE_BUCKET, 'bucket_name')

    const contentStorage = await ContentStorageFactory.create(env)

    expect(contentStorage instanceof S3ContentStorage).toBeTruthy()
  })
})
