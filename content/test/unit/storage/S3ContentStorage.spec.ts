import { ContentStorage } from "@katalyst/content/storage/ContentStorage";
import { S3ContentStorage } from "@katalyst/content/storage/S3ContentStorage";
import AWS from 'aws-sdk'

xdescribe("ContentStorage", () => {

    // TODO: Reuse ContentStorage.spec.ts but with a different configuration.

    let storage: ContentStorage
    let category: string
    let id: string
    let content: Buffer

    let accessKeyId: string = "***REMOVED***"
    let secretAccessKey: string = "***REMOVED***"
    let bucket: string = "marcosnc.decentraland.zone"

    beforeAll(async () => {
        await deleteAllInsideBucket()
        storage = await S3ContentStorage.build(accessKeyId, secretAccessKey, bucket)

        category = "some-category"
        id = "some-id"
        content = Buffer.from("123")
    })

    afterAll(async () => {
        await deleteAllInsideBucket()
    })

    async function deleteAllInsideBucket(): Promise<void> {
        const s3Client = new AWS.S3({ accessKeyId, secretAccessKey })
        const items = await getAllElementsInBucket(s3Client)
        items.forEach(item => {
            console.log(item)
        })
        await Promise.all(items.map(item => {
            const request: AWS.S3.Types.DeleteObjectRequest = {
                Bucket: bucket,
                Key: item,
            }
            return new Promise((resolve, reject) => {
                s3Client.deleteObject(request, (error, data) => {
                    if (error) {
                        console.error(`Error deleting data from S3. Id: ${item}`, error);
                        return reject(error)
                    }
                    return resolve()
                })
            })
        }))
    }

    async function getAllElementsInBucket(s3Client: AWS.S3): Promise<string[]> {
        const request: AWS.S3.Types.ListObjectsRequest = {
            Bucket: bucket,
            Prefix: "",
        }
        return new Promise((resolve, reject) => {
            s3Client.listObjects(request, (error, data: AWS.S3.Types.ListObjectsOutput) => {
                if (error) {
                    console.error('Error listing data from S3.', error);
                    return reject(error)
                }
                return resolve(data.Contents?.map(element => element.Key ?? ""))
            })
        })
    }

    it(`When content is stored, then it can be retrieved`, async () => {
        await storage.store(category, id, content)

        const retrievedContent = await storage.getContent(category, id)
        expect(retrievedContent).toEqual(content);
    });

    it(`When content is stored, then it can be listed`, async function () {
        await storage.store(category, id, content)

        const ids = await storage.listIds(category)

        expect(ids).toEqual([id])
    });

    it(`When content is stored, then we can check if it exists`, async function () {
        await storage.store(category, id, content)

        const exists = await storage.exists(category, id)

        expect(exists).toBe(true)
    });

    it(`When content is stored on already existing id, then it overwrites the previous content`, async function () {
        const newContent = Buffer.from("456")

        await storage.store(category, id, content)
        await storage.store(category, id, newContent)

        const retrievedContent = await storage.getContent(category, id)
        expect(retrievedContent).toEqual(newContent);
    });

    it(`When content is deleted, then it is no longer available`, async function () {
        await storage.store(category, id, content)

        var exists = await storage.exists(category, id)
        expect(exists).toBe(true)

        await storage.delete(category, id)

        exists = await storage.exists(category, id)
        expect(exists).toBe(false)
        const ids = await storage.listIds(category)
        expect(ids).toEqual([])
    });

});
