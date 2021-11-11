import fs from 'fs'

export async function getFileStream(filePath: string): Promise<[NodeJS.ReadableStream, number]> {
  const stat = await fs.promises.stat(filePath)
  return [fs.createReadStream(filePath), stat.size]
}
