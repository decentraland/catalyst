import * as CID from 'cids'
import { File } from './Service';

export class Hashing {

    /** Given a set of files, return a map with their hash */
    static calculateHashes(files: Set<File>): Map<FileHash, File> {
        const entries: [FileHash, File][] = [...files].map(file => [this.calculateHash(file), file])
        return new Map(entries);
    }

    /** Return the given file's hash */
    static calculateHash(file: File): FileHash {
        const cid:CID = new CID(file.content)
        return cid.toString()
    }

}

export type FileHash = string