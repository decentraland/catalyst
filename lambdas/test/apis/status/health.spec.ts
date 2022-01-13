import { Logger } from 'log4js'
import sinon from 'sinon'
import { anything, instance, mock, when } from 'ts-mockito'
import { HealthStatus, refreshContentServerStatus } from '../../../src/apis/status/health'
import { SmartContentClient } from '../../../src/utils/SmartContentClient'

describe("Lambda's Controller Utils", () => {
  describe('refreshContentServerStatus', () => {
    let contentClientMock: SmartContentClient

    describe('when the service is synced', () => {
      const mockedHealthyStatus = {
        currentTime: 100,
        synchronizationStatus: {
          lastSyncWithOtherServers: 100
        }
      }

      beforeAll(() => {
        contentClientMock = mock(SmartContentClient)
        when(contentClientMock.fetchContentStatus()).thenReturn(Promise.resolve(mockedHealthyStatus as any))
        when(contentClientMock.fetchEntitiesByPointers(anything(), anything())).thenReturn(
          Promise.resolve(mockedHealthyStatus as any)
        )
      })

      it('should return a healthy status', async () => {
        const logger = mock(Logger)

        expect(await refreshContentServerStatus(instance(contentClientMock), '10s', '10s', logger)).toEqual(
          HealthStatus.HEALTHY
        )
      })
    })

    describe('when the service has old information', () => {
      const mockedHealthyStatus = {
        currentTime: 1000000,
        synchronizationStatus: {
          lastSyncWithOtherServers: 100
        }
      }

      beforeAll(() => {
        contentClientMock = mock(SmartContentClient)
        when(contentClientMock.fetchContentStatus()).thenReturn(Promise.resolve(mockedHealthyStatus as any))
        when(contentClientMock.fetchEntitiesByPointers(anything(), anything())).thenReturn(
          Promise.resolve(mockedHealthyStatus as any)
        )
      })

      it('should return an unhealthy status', async () => {
        const logger = mock(Logger)

        expect(await refreshContentServerStatus(instance(contentClientMock), '10s', '10s', logger)).toEqual(
          HealthStatus.UNHEALTHY
        )
      })
    })

    describe('when the service takes too much time to obtain deployment', () => {
      const mockedHealthyStatus = {
        currentTime: 100,
        synchronizationStatus: {
          lastSyncWithOtherServers: 100
        }
      }
      let dateNowStub: sinon.SinonStub

      beforeAll(() => {
        contentClientMock = mock(SmartContentClient)
        when(contentClientMock.fetchContentStatus()).thenReturn(Promise.resolve(mockedHealthyStatus as any))
        when(contentClientMock.fetchEntitiesByPointers(anything(), anything())).thenReturn(
          Promise.resolve(mockedHealthyStatus as any)
        )

        dateNowStub = sinon
          .stub(Date, 'now' as any)
          .onFirstCall()
          .returns(100)
          .onSecondCall()
          .returns(1000000)
      })

      afterAll(() => {
        dateNowStub.restore()
      })

      it('should return aa unhealthy status', async () => {
        const logger = mock(Logger)

        expect(await refreshContentServerStatus(instance(contentClientMock), '10s', '10s', logger)).toEqual(
          HealthStatus.UNHEALTHY
        )
      })
    })

    describe('when the request fails', () => {
      it('should return a down status', async () => {
        const logger = mock(Logger)

        expect(
          await refreshContentServerStatus(
            { getClientUrl: () => Promise.resolve('mockUrl') } as any,
            '10s',
            '10s',
            logger
          )
        ).toEqual(HealthStatus.DOWN)
      })
    })
  })
})
