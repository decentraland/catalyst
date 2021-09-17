import AWS from 'aws-sdk'
import { ContentStorage } from '../../../src/storage/ContentStorage'
import { S3ContentStorage } from '../../../src/storage/S3ContentStorage'

xdescribe('S3ContentStorage', () => {
  // TODO: Reuse ContentStorage.spec.ts but with a different configuration.

  let storage: ContentStorage
  let id: string
  let content: Buffer

  const accessKeyId: string = '***REMOVED***'
  const secretAccessKey: string = '***REMOVED***'
  const bucket: string = 'marcosnc.decentraland.zone'

  beforeAll(async () => {
    await deleteAllInsideBucket()
    storage = await S3ContentStorage.build(accessKeyId, secretAccessKey, bucket)

    id = 'some-id'
    content = Buffer.from('123')
  })

  afterAll(async () => {
    await deleteAllInsideBucket()
  })

  async function deleteAllInsideBucket(): Promise<void> {
    const s3Client = new AWS.S3({ accessKeyId, secretAccessKey })
    const items = await getAllElementsInBucket(s3Client)
    items.forEach((item) => {
      console.log(item)
    })
    await Promise.all(
      items.map((item) => {
        const request: AWS.S3.Types.DeleteObjectRequest = {
          Bucket: bucket,
          Key: item
        }
        return new Promise((resolve, reject) => {
          s3Client.deleteObject(request, (error, data) => {
            if (error) {
              console.error(`Error deleting data from S3. Id: ${item}`, error)
              return reject(error)
            }
            return resolve(undefined)
          })
        })
      })
    )
  }

  async function getAllElementsInBucket(s3Client: AWS.S3): Promise<string[]> {
    const request: AWS.S3.Types.ListObjectsRequest = {
      Bucket: bucket,
      Prefix: ''
    }
    return new Promise((resolve, reject) => {
      s3Client.listObjects(request, (error, data: AWS.S3.Types.ListObjectsOutput) => {
        if (error) {
          console.error('Error listing data from S3.', error)
          return reject(error)
        }
        return resolve(data.Contents?.map((element) => element.Key ?? '') ?? [])
      })
    })
  }

  it(`When content is stored, then it can be retrieved`, async () => {
    await storage.store(id, content)

    const retrievedContent = await storage.retrieve(id)
    expect(await retrievedContent?.asBuffer()).toEqual(content)
  })

  it(`When content is stored, then we can check if it exists`, async function () {
    await storage.store(id, content)

    const exists = await storage.exist([id])

    expect(exists.get(id)).toBe(true)
  })

  it(`When content is stored on already existing id, then it overwrites the previous content`, async function () {
    const newContent = Buffer.from('456')

    await storage.store(id, content)
    await storage.store(id, newContent)

    const retrievedContent = await storage.retrieve(id)
    expect(await retrievedContent?.asBuffer()).toEqual(newContent)
  })

  it(`When content is deleted, then it is no longer available`, async function () {
    await storage.store(id, content)

    let exists = await storage.exist([id])
    expect(exists.get(id)).toBe(true)

    await storage.delete([id])

    exists = await storage.exist([id])
    expect(exists.get(id)).toBe(false)
  })
})
