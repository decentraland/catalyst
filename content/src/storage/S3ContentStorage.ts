import { ContentStorage, ContentItem, streamToBuffer } from "./ContentStorage";
import AWS from 'aws-sdk'
import { Readable } from "stream";

export class S3ContentStorage implements ContentStorage {

    private s3Client: AWS.S3

    private constructor(accessKeyId: string, secretAccessKey: string, private bucket: string) {
        this.s3Client = new AWS.S3({
            accessKeyId,
            secretAccessKey
        })
    }

    static async build(accessKeyId: string, secretAccessKey: string, bucket: string): Promise<S3ContentStorage> {
        return new S3ContentStorage(accessKeyId, secretAccessKey, bucket)
    }


    async store(id: string, content: Buffer): Promise<void> {
        const request: AWS.S3.Types.PutObjectRequest = {
            Bucket: this.bucket,
            Key: id,
            Body: content,
        }

        return new Promise((resolve, reject) => {
            this.s3Client.upload(request, (error, data) => {
                if (error) {
                    console.error(`Error uploading data to S3. Id: ${id}`, error);
                    return reject(error)
                }
                console.log(`Successfully uploaded data to S3. Id: ${id}`);
                return resolve()
            })
        })
    }

    delete(id: string): Promise<void> {
        const request: AWS.S3.Types.DeleteObjectRequest = {
            Bucket: this.bucket,
            Key: id,
        }

        return new Promise((resolve, reject) => {
            this.s3Client.deleteObject(request, (error, data) => {
                if (error) {
                    console.error(`Error deleting data from S3. Id: ${id}`, error);
                    return reject(error)
                }
                console.log(`Successfully deleted data from S3. Id: ${id}`);
                return resolve()
            })
        })
    }

    async retrieve(id: string): Promise<ContentItem | undefined> {
        const request: AWS.S3.Types.GetObjectRequest = {
            Bucket: this.bucket,
            Key: id,
        }
        const content = await this.getContentFromS3(id, request)
        if (content) {
            return new S3ContentItem(content.readable, content.length)
        }
        return undefined
    }

    private getContentFromS3(key: string, request: AWS.S3.Types.GetObjectRequest): Promise<{ readable: Readable, length?: number } | undefined> {
        return new Promise((resolve) => {
            this.s3Client.getObject(request, (error, data: AWS.S3.Types.GetObjectOutput) => {
                if (error) {
                    console.error(`Error retrieving data from S3. Id: ${key}`, error);
                    return resolve(undefined)
                }

                console.log(`Successfully retrieved data from S3. Id: ${key}`);
                return resolve({readable: data.Body as Readable, length: data.ContentLength})
            })
        })
    }

    exist(ids: string[]): Promise<Map<string, boolean>> {
        throw new Error('Not implemented')
        // const request: AWS.S3.Types.HeadObjectRequest = {
        //     Bucket: this.bucket,
        //     Key: id,
        // }

        // return new Promise((resolve, reject) => {
        //     this.s3Client.headObject(request, (error, data: AWS.S3.Types.HeadObjectOutput) => {
        //         if (error && error.code!=="NotFound") {
        //             console.error(`Error checking data from S3. Id: ${id}`, error);
        //             return reject(error)
        //         }

        //         console.log(`Successfully checked data from S3. Id: ${id}`);
        //         return resolve(!error)
        //     })
        // })
    }

}

class S3ContentItem implements ContentItem {

    constructor(private readable: Readable, private length?: number) { }

    asBuffer(): Promise<Buffer> {
        return streamToBuffer(this.readable)
    }

    asStream(): Readable {
        return this.readable
    }

    getLength(): number | undefined {
        return this.length
    }
}
