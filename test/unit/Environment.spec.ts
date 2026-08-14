import { EnvironmentBuilder } from '../../src/Environment'

describe('EnvironmentBuilder synchronization concurrency configuration', () => {
  afterEach(() => {
    delete process.env.SYNC_CONTENT_DOWNLOAD_CONCURRENCY
    delete process.env.SYNC_SNAPSHOT_CONCURRENCY
    delete process.env.SYNC_SNAPSHOT_CHECK_CONCURRENCY
  })

  describe('when content download concurrency exceeds its operational ceiling', () => {
    beforeEach(() => {
      process.env.SYNC_CONTENT_DOWNLOAD_CONCURRENCY = '1001'
    })

    it('should reject the configuration before creating resource-intensive queues', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow(
        'Invalid SYNC_CONTENT_DOWNLOAD_CONCURRENCY: expected a value between 1 and 1000 but got "1001"'
      )
    })
  })

  describe('when snapshot deployment concurrency exceeds its operational ceiling', () => {
    beforeEach(() => {
      process.env.SYNC_SNAPSHOT_CONCURRENCY = '101'
    })

    it('should reject the configuration before opening snapshot streams', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow(
        'Invalid SYNC_SNAPSHOT_CONCURRENCY: expected a value between 1 and 100 but got "101"'
      )
    })
  })

  describe('when snapshot check concurrency exceeds its operational ceiling', () => {
    beforeEach(() => {
      process.env.SYNC_SNAPSHOT_CHECK_CONCURRENCY = '101'
    })

    it('should reject the configuration before scheduling storage checks', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow(
        'Invalid SYNC_SNAPSHOT_CHECK_CONCURRENCY: expected a value between 1 and 100 but got "101"'
      )
    })
  })
})
