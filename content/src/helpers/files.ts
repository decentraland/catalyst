import { rename } from 'fs/promises'
import { join } from 'path'

export async function moveFile(fileName: string, oldFolder: string, newFolder: string): Promise<void> {
  await rename(join(oldFolder, fileName), join(newFolder, fileName))
}
