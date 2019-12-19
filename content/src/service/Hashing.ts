import CID from 'cids'
import { File } from './Service';
import multihashing from 'multihashing-async';

// TODO: Consider if having all content in memory is necessary or not. Also, make sure that we are producing the same result as the CLI
export class Hashing {

    /** Given a set of files, return a map with their hash */
    static async calculateHashes(files: File[]): Promise<Map<FileHash, File>> {
        const entries: Promise<[FileHash, File]>[] = Array.from(files)
            .map(file => this.calculateHash(file).then(hash => [hash, file]))
        return new Map(await Promise.all(entries));
    }

    /** Return the given file's hash */
    static async calculateHash(file: File): Promise<FileHash> {
        return this.calculateBufferHash(file.content)
    }

    /** Return the given buffer's hash */
    static async calculateBufferHash(buffer: Buffer): Promise<FileHash> {
        const hash = await multihashing(buffer, "sha2-256")
        return new CID(0, 'dag-pb', hash).toBaseEncodedString()
    }
}

export type FileHash = string