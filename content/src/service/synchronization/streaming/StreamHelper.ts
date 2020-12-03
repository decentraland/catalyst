import { pipeline, Transform, Readable, PassThrough } from 'stream'
import mergeStream from 'merge-stream'
import util from 'util'

export const awaitablePipeline = util.promisify(pipeline)

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
  })
}

/** Generate a transform stream that maps values based on a mapping function */
export function streamMap<T1, T2>(mapping: (value: T1) => T2) {
  return new Transform({
    objectMode: true,
    transform: (value, _, done) => {
      done(null, mapping(value))
    }
  })
}

export function mergeStreams(readables: Readable[]): NodeJS.ReadableStream {
  return mergeStream(readables)
}

/** Create a PassThrough stream that calls the callback with each value */
export function passThrough(callback: (value) => void): PassThrough {
  return new PassThrough({
    objectMode: true,
    transform: (data, _, done) => {
      callback(data)
      done(null, data)
    }
  })
}
