export type Configuration = {
  STORAGE_ROOT_FOLDER: string
  SERVER_PORT: string
}

export async function createConfiguration(): Promise<Configuration> {
  return {
    STORAGE_ROOT_FOLDER: process.env.STORAGE ?? 'asdf',
    SERVER_PORT: process.env.SERVER_PORT ?? '1234'
  }
}
