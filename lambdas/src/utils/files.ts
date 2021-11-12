import fs from 'fs'

export async function getFileStream(filePath: string): Promise<[NodeJS.ReadableStream, number]> {
  const stat = await fs.promises.stat(filePath)
  return [fs.createReadStream(filePath), stat.size]
}

export async function checkFileExists(file: string): Promise<boolean> {
  return fs.promises
    .access(file, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false)
}
