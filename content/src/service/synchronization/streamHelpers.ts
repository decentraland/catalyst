export interface ReadableStreamish {
  once: any
  read: any
}

async function onceReadable(stream: ReadableStreamish) {
  return new Promise<void>((resolve) => {
    stream.once('readable', () => {
      resolve()
    })
  })
}

async function* _fromStream(stream: ReadableStreamish) {
  while (true) {
    const data = stream.read()
    if (data !== null) {
      yield data
      continue
    }
    if ((stream as any)._readableState.ended) {
      break
    }
    await onceReadable(stream)
  }
}

export function iteratorFromStream<T>(stream: ReadableStreamish): AsyncIterable<T> {
  if (Symbol.asyncIterator in stream) {
    return stream as any
  }

  return _fromStream(stream) as AsyncIterable<T>
}
