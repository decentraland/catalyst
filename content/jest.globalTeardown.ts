export default async (): Promise<void> => {
  await global.__POSTGRES_CONTAINER__?.stop()
}
