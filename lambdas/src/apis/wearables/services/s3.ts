import AWS from 'aws-sdk'
import { env, utils, Log } from 'decentraland-commons'

const ACCESS_KEY = env.get('AWS_ACCESS_KEY', '')
const ACCESS_SECRET = env.get('AWS_ACCESS_SECRET', '')
const BUCKET_NAME = env.get('AWS_BUCKET_NAME', '')

const log = new Log('s3')

if (!ACCESS_KEY || !ACCESS_SECRET || !BUCKET_NAME) {
  log.warn(
    'You need to add all the AWS related env vars to be able to use it. AWS will be disabled. Check the .env.example file'
  )
}

export const ACL = {
  private: 'private' as 'private',
  publicRead: 'public-read' as 'public-read',
  publicReadWrite: 'public-read-write' as 'public-read-write',
  authenticatedRead: 'authenticated-read' as 'authenticated-read',
  awsExecRead: 'aws-exec-read' as 'aws-exec-read',
  bucketOwnerRead: 'bucket-owner-read' as 'bucket-owner-read',
  bucketOwnerFullControl: 'bucket-owner-full-control' as 'bucket-owner-full-control'
}
export type ACLValues = typeof ACL[keyof typeof ACL]

export const s3 = new AWS.S3({
  accessKeyId: ACCESS_KEY,
  secretAccessKey: ACCESS_SECRET
})

export function readFile(key: string): Promise<AWS.S3.GetObjectOutput> {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key
  }
  log.info(`Reading file "${key}"`)
  return utils.promisify<AWS.S3.GetObjectOutput>(s3.getObject.bind(s3))(params)
}
