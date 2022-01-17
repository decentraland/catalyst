const globalTeardown = async (): Promise<void> => {
  await global.__POSTGRES_CONTAINER__?.stop()
}

export default globalTeardown
