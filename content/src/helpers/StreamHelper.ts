import { pipeline, Readable } from "stream"
import util from "util"

export const awaitablePipeline = util.promisify(pipeline);

export function streamFrom<T>(array: Array<T>): Readable {
    const readable = new Readable({ objectMode: true });
    array.forEach(value => readable.push(value));
    readable.push(null); // Mark the end of the stream
    return readable
}
