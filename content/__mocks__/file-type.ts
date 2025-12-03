// Mock for the file-type ESM module
export class FileTypeParser {
  async fromStream(_stream: NodeJS.ReadableStream): Promise<{ mime: string; ext: string } | undefined> {
    return { mime: 'application/octet-stream', ext: 'bin' }
  }

  async fromBuffer(_buffer: Buffer): Promise<{ mime: string; ext: string } | undefined> {
    return { mime: 'application/octet-stream', ext: 'bin' }
  }

  async fromFile(_path: string): Promise<{ mime: string; ext: string } | undefined> {
    return { mime: 'application/octet-stream', ext: 'bin' }
  }
}

export const fileTypeFromStream = async (_stream: NodeJS.ReadableStream) => {
  return { mime: 'application/octet-stream', ext: 'bin' }
}

export const fileTypeFromBuffer = async (_buffer: Buffer) => {
  return { mime: 'application/octet-stream', ext: 'bin' }
}

export const fileTypeFromFile = async (_path: string) => {
  return { mime: 'application/octet-stream', ext: 'bin' }
}
