import { HealthStatus, refreshContentServerStatus } from '../../../src/apis/status/health'
import { SmartContentClient } from '../../../src/utils/SmartContentClient'

describe("Lambda's Controller Utils", () => {
  describe('refreshContentServerStatus', () => {
    describe('when the service is synced', () => {
      let contentClientMock: jest.Mocked<SmartContentClient>
      let mockedHealthyStatus: any
      let logger: any

      beforeEach(() => {
        mockedHealthyStatus = {
          currentTime: 100,
          synchronizationStatus: {
            lastSyncWithOtherServers: 100,
            synchronizationState: 'Syncing'
          }
        }
        contentClientMock = {
          fetchContentStatus: jest.fn().mockResolvedValue(mockedHealthyStatus),
          fetchEntitiesByPointers: jest.fn().mockResolvedValue(mockedHealthyStatus)
        } as unknown as jest.Mocked<SmartContentClient>
        logger = {
          debug: jest.fn(),
          error: jest.fn(),
          info: jest.fn(),
          log: jest.fn(),
          warn: jest.fn()
        }
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should return a healthy status', async () => {
        expect(await refreshContentServerStatus(contentClientMock, '10s', '10s', logger)).toEqual(HealthStatus.HEALTHY)
      })
    })

    describe('when the service has old information', () => {
      let contentClientMock: jest.Mocked<SmartContentClient>
      let mockedHealthyStatus: any
      let logger: any

      beforeEach(() => {
        mockedHealthyStatus = {
          currentTime: 1000000,
          synchronizationStatus: {
            lastSyncWithOtherServers: 100,
            synchronizationState: 'Syncing'
          }
        }
        contentClientMock = {
          fetchContentStatus: jest.fn().mockResolvedValue(mockedHealthyStatus),
          fetchEntitiesByPointers: jest.fn().mockResolvedValue(mockedHealthyStatus)
        } as unknown as jest.Mocked<SmartContentClient>
        logger = {
          debug: jest.fn(),
          error: jest.fn(),
          info: jest.fn(),
          log: jest.fn(),
          warn: jest.fn()
        }
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should return an unhealthy status', async () => {
        expect(await refreshContentServerStatus(contentClientMock, '10s', '10s', logger)).toEqual(HealthStatus.UNHEALTHY)
      })
    })

    describe('when the service takes too much time to obtain deployment', () => {
      let contentClientMock: jest.Mocked<SmartContentClient>
      let mockedHealthyStatus: any
      let logger: any
      let dateNowSpy: jest.SpyInstance

      beforeEach(() => {
        mockedHealthyStatus = {
          currentTime: 100,
          synchronizationStatus: {
            lastSyncWithOtherServers: 100,
            synchronizationState: 'Syncing'
          }
        }
        contentClientMock = {
          fetchContentStatus: jest.fn().mockResolvedValue(mockedHealthyStatus),
          fetchEntitiesByPointers: jest.fn().mockResolvedValue(mockedHealthyStatus)
        } as unknown as jest.Mocked<SmartContentClient>
        logger = {
          debug: jest.fn(),
          error: jest.fn(),
          info: jest.fn(),
          log: jest.fn(),
          warn: jest.fn()
        }

        dateNowSpy = jest.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(1000000)
      })

      afterEach(() => {
        dateNowSpy.mockRestore()
        jest.resetAllMocks()
      })

      it('should return an unhealthy status', async () => {
        expect(await refreshContentServerStatus(contentClientMock, '10s', '10s', logger)).toEqual(HealthStatus.UNHEALTHY)
      })
    })

    describe('when the service is bootstrapping', () => {
      let contentClientMock: jest.Mocked<SmartContentClient>
      let mockedUnhealthyStatus: any
      let logger: any

      beforeEach(() => {
        mockedUnhealthyStatus = {
          currentTime: 100,
          synchronizationStatus: {
            lastSyncWithOtherServers: 100,
            synchronizationState: 'Bootstrapping'
          }
        }
        contentClientMock = {
          fetchContentStatus: jest.fn().mockResolvedValue(mockedUnhealthyStatus),
          fetchEntitiesByPointers: jest.fn().mockResolvedValue(mockedUnhealthyStatus)
        } as unknown as jest.Mocked<SmartContentClient>
        logger = {
          debug: jest.fn(),
          error: jest.fn(),
          info: jest.fn(),
          log: jest.fn(),
          warn: jest.fn()
        }
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should return an unhealthy status', async () => {
        expect(await refreshContentServerStatus(contentClientMock, '10s', '10s', logger)).toEqual(HealthStatus.UNHEALTHY)
      })
    })

    describe('when the request fails', () => {
      let logger: any

      beforeEach(() => {
        logger = {
          debug: jest.fn(),
          error: jest.fn(),
          info: jest.fn(),
          log: jest.fn(),
          warn: jest.fn()
        }
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should return a down status', async () => {
        expect(
          await refreshContentServerStatus({ getClientUrl: () => Promise.resolve('mockUrl') } as any, '10s', '10s', logger)
        ).toEqual(HealthStatus.DOWN)
      })
    })
  })
})
