import * as stream from "stream";

export interface ContentStorage {
    store(category: string, id: string, content: Buffer, append?: boolean): Promise<void>;
    delete(category: string, id: string): Promise<void>;
    getContent(category: string, id: string): Promise<ContentItem | undefined>;
    listIds(category: string): Promise<string[]>;
    exists(category: string, id: string): Promise<boolean>;
}

export interface ContentItem {
    asBuffer(): Promise<Buffer>
    asStream(): stream.Readable
}

export class SimpleContentItem implements ContentItem {

    private constructor(private buffer?: Buffer, private stream?: stream.Readable) { }

    static fromBuffer(buffer: Buffer): SimpleContentItem {
        return new SimpleContentItem(buffer)
    }

    static fromStream(stream: stream.Readable): SimpleContentItem {
        return new SimpleContentItem(undefined, stream)
    }

    async asBuffer(): Promise<Buffer> {
        if (this.buffer) {
            return this.buffer
        }
        return streamToBuffer(this.stream)
    }

    asStream(): stream.Readable {
        if (this.stream) {
            return this.stream
        }
        return bufferToStream(this.buffer)
    }

}

export function bufferToStream(buffer): stream.Readable {
    let streamDuplex = new stream.Duplex();
    streamDuplex.push(buffer);
    streamDuplex.push(null);
    return streamDuplex;
}

export function streamToBuffer(stream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        let buffers: any[] = [];
        stream.on('error', reject)
        stream.on('data', (data) => buffers.push(data))
        stream.on('end', () => resolve(Buffer.concat(buffers)))
    });
}
