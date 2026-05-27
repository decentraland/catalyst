const globalTeardown = async (): Promise<void> => {
  await globalThis.__POSTGRES_CONTAINER__?.stop()
}

export default globalTeardown
