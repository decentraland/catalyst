import { ContentStorage } from "./ContentStorage";
import AWS from 'aws-sdk'

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


    async store(category: string, id: string, content: Buffer, append?: boolean | undefined): Promise<void> {
        const key: string = this.createKey(category, id)

        if (append) {
            // TODO: This is extremely inefficient but S3 does not provide an append operation. Can we find a better approach?
            const currentContent = await this.getContent(category, id)
            if (currentContent) {
                content = Buffer.concat([currentContent, content])
            }
        }

        const request: AWS.S3.Types.PutObjectRequest = {
            Bucket: this.bucket,
            Key: key,
            Body: content,
        }

        return new Promise((resolve, reject) => {
            this.s3Client.upload(request, (error, data) => {
                if (error) {
                    console.error(`Error uploading data to S3. Id: ${key}`, error);
                    return reject(error)
                }
                console.log(`Successfully uploaded data to S3. Id: ${key}`);
                return resolve()
            })
        })
    }

    delete(category: string, id: string): Promise<void> {
        const key: string = this.createKey(category, id)
        const request: AWS.S3.Types.DeleteObjectRequest = {
            Bucket: this.bucket,
            Key: key,
        }

        return new Promise((resolve, reject) => {
            this.s3Client.deleteObject(request, (error, data) => {
                if (error) {
                    console.error(`Error deleting data from S3. Id: ${key}`, error);
                    return reject(error)
                }
                console.log(`Successfully deleted data from S3. Id: ${key}`);
                return resolve()
            })
        })
    }

    getContent(category: string, id: string): Promise<Buffer | undefined> {
        const key: string = this.createKey(category, id)
        const request: AWS.S3.Types.GetObjectRequest = {
            Bucket: this.bucket,
            Key: key,
        }

        return new Promise((resolve) => {
            this.s3Client.getObject(request, (error, data: AWS.S3.Types.GetObjectOutput) => {
                if (error) {
                    console.error(`Error retrieving data from S3. Id: ${key}`, error);
                    return resolve(undefined)
                }

                console.log(`Successfully retrieved data from S3. Id: ${key}`);
                return resolve(data.Body as Buffer)
            })
        })
    }

    listIds(category: string): Promise<string[]> {
        const key: string = this.createKey(category)
        const request: AWS.S3.Types.ListObjectsRequest = {
            Bucket: this.bucket,
            Prefix: key,
        }

        return new Promise((resolve, reject) => {
            this.s3Client.listObjects(request, (error, data: AWS.S3.Types.ListObjectsOutput) => {
                if (error) {
                    console.error(`Error listing data from S3. Id: ${key}`, error);
                    return reject(error)
                }

                console.log(`Successfully listed data from S3. Id: ${key}`);
                return resolve(data.Contents?.map(element => this.removeCategory(category, element.Key)))
            })
        })
    }

    private removeCategory(category: string, objectKey: string|undefined): string {
        return objectKey?.substring(category.length+1) ?? ""
    }

    exists(category: string, id: string): Promise<boolean> {
        const key: string = this.createKey(category, id)
        const request: AWS.S3.Types.HeadObjectRequest = {
            Bucket: this.bucket,
            Key: key,
        }

        return new Promise((resolve, reject) => {
            this.s3Client.headObject(request, (error, data: AWS.S3.Types.HeadObjectOutput) => {
                if (error && error.code!=="NotFound") {
                    console.error(`Error checking data from S3. Id: ${key}`, error);
                    return reject(error)
                }

                console.log(`Successfully checked data from S3. Id: ${key}`);
                return resolve(!error)
            })
        })
    }

    private createKey(category: string, id?: string): string {
        if (id) {
            return category + '/' + id
        }
        return category + '/'
    }

}
