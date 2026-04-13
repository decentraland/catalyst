import { createTestDatabaseComponent, IDatabaseComponent } from '../../../src/ports/postgres'

describe('createTestDatabaseComponent', () => {
  let database: IDatabaseComponent

  beforeEach(() => {
    database = createTestDatabaseComponent()
  })

  it('should have query method that throws', async () => {
    await expect(database.query('SELECT 1')).rejects.toThrow('query Not implemented')
  })

  it('should have streamQuery method that throws', async () => {
    const generator = database.streamQuery({} as any)
    await expect(generator.next()).rejects.toThrow('streamQuery Not implemented')
  })

  it('should have withTransaction method that throws', async () => {
    await expect(database.withTransaction(async () => {})).rejects.toThrow('withTransaction Not implemented')
  })

  it('should have withAsyncContextTransaction method that throws', async () => {
    await expect(database.withAsyncContextTransaction(async () => {})).rejects.toThrow(
      'withAsyncContextTransaction Not implemented'
    )
  })

  it('should have start and stop methods that resolve', async () => {
    await expect(database.start()).resolves.toBeUndefined()
    await expect(database.stop()).resolves.toBeUndefined()
  })
})
