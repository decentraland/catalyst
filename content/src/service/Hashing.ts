import CID from 'cids'
import { ContentFile } from './Service';
import multihashing from 'multihashing-async';

// TODO: Consider if having all content in memory is necessary or not. Also, make sure that we are producing the same result as the CLI
export class Hashing {

    /** Given a set of files, return a map with their hash */
    static async calculateHashes(files: ContentFile[]): Promise<Map<ContentFileHash, ContentFile>> {
        const entries: Promise<[ContentFileHash, ContentFile]>[] = Array.from(files)
            .map<Promise<[ContentFileHash, ContentFile]>>(async file => [await this.calculateHash(file), file])
        return new Map(await Promise.all(entries));
    }

    /** Return the given file's hash */
    static async calculateHash(file: ContentFile): Promise<ContentFileHash> {
        return this.calculateBufferHash(file.content)
    }

    /** Return the given buffer's hash */
    static async calculateBufferHash(buffer: Buffer): Promise<ContentFileHash> {
        const hash = await multihashing(buffer, "sha2-256")
        return new CID(0, 'dag-pb', hash).toBaseEncodedString()
    }
}

export type ContentFileHash = string