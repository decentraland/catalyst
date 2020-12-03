import fs from 'fs'

export async function existPath(path: string): Promise<boolean> {
  try {
    await fs.promises.access(path, fs.constants.F_OK | fs.constants.W_OK)
    return true
  } catch (error) {
    return false
  }
}

export async function ensureDirectoryExists(directory: string): Promise<void> {
  const alreadyExist = await existPath(directory)
  if (!alreadyExist) {
    try {
      await fs.promises.mkdir(directory, { recursive: true })
    } catch (error) {
      // Ignore these errors
    }
  }
}
