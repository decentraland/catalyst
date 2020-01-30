import { pipeline, Readable, Duplex, Writable, Transform } from "stream"
import util from "util"

export const awaitablePipeline = util.promisify(pipeline);

/**
 * This pipeline contains a number of streams inside, and waits until the last one is added to start.
 * It also provides a way to destroy the pipeline, without knowing the initial reader.
 */
export class StreamPipeline {

    private readonly chain: Array<Duplex | Writable> = []

    constructor(private readonly readableStream: Readable) { }

    add(stream: Duplex): StreamPipeline {
        this.chain.push(stream)
        return this
    }

    addAndExecute(writableStream: Writable): Promise<void> {
        this.chain.push(writableStream)
        const first = this.chain.shift() as Duplex | Writable
        return awaitablePipeline(this.readableStream, first, ...this.chain)
    }

    destroy() {
        this.readableStream.destroy()
    }

}

export function streamFrom<T>(array: Array<T>): Readable {
    const readable = new Readable({ objectMode: true });
    array.forEach(value => readable.push(value));
    readable.push(null); // Mark the end of the stream
    return readable
}

/** Generate a transform stream that filters values based on a predicate */
export function streamFilter<T>(predicate: (value: T) => boolean) {
    return new Transform({
        objectMode: true,
        transform: (value, _, done) => {
            if (predicate(value)) {
                done(null, value)
            } else {
                done()
            }
        }
    });
}

/** Generate a transform stream that maps values based on a mapping function */
export function streamMap<T1, T2>(mapping: (value: T1) => T2) {
    return new Transform({
        objectMode: true,
        transform: (value, _, done) => {
            done(null, mapping(value))
        }
    });
}

/** Generate a writable stream that writes to an array */
export function streamToArray(elements: any[]) {
    return new Writable({
        objectMode: true,
        write: async (element, _, done) => {
            elements.push(element)
            done()
        }
    });
}

/** Generate a transform that takes a stream of objects, and returns a stringified JSON array */
export function streamOfObjectsToJsonStringArray() {
    let firstWrite = true
    return new Transform({
        objectMode: true,
        transform: (object, _, done) => {
            if (firstWrite) {
                done(null, '[' + JSON.stringify(object))
                firstWrite = false
            } else {
                done(null, ',' + JSON.stringify(object))
            }
        },
        final: () => {
            this.emit('data', ']');
        }
    });
}