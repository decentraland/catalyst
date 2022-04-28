import printApiCoverage from './printApiCoverage'

const globalTeardown = async (): Promise<void> => {
  if (process.env.API_COVERAGE === 'true') {
    printApiCoverage()
  }
  await globalThis.__POSTGRES_CONTAINER__?.stop()
}

export default globalTeardown
