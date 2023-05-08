import path from 'path'
import { AppComponents, UPLOADS_DIRECTORY } from '../types'

export async function purgeUploadsDirectory({ logs, fs }: Pick<AppComponents, 'logs' | 'fs'>): Promise<void> {
  const logger = logs.getLogger('purge-uploads-directory')
  logger.info("Cleaning up the Server's uploads directory...")
  try {
    const directory = UPLOADS_DIRECTORY
    const files = await fs.readdir(directory)
    files.forEach(async (file) => {
      await fs.unlink(path.join(directory, file))
    })
    logger.info('Cleaned up!')
  } catch (e) {
    logger.error('There was an error while cleaning up the upload directory: ', e)
  }
}
