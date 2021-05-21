import { HealthStatus, refreshContentServerStatus } from '@katalyst/lambdas/utils/health'
import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { Logger } from 'log4js'
import fetch from 'node-fetch'
import sinon from 'sinon'
import { instance, mock, when } from 'ts-mockito'

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

      let fetchStub: sinon.SinonStub

      beforeAll(() => {
        contentClientMock = mock(SmartContentClient)
        when(contentClientMock.fetchContentStatus()).thenReturn(Promise.resolve(mockedHealthyStatus as any))
        when(contentClientMock.getClientUrl()).thenReturn(Promise.resolve('mockUrl'))
        fetchStub = sinon.stub(fetch, 'Promise' as any).returns({ json: () => Promise.resolve(mockedHealthyStatus) })
      })

      afterAll(() => {
        fetchStub.restore()
      })

      it('should return a healthy status', async () => {
        const logger = mock(Logger)

        expect(await refreshContentServerStatus(instance(contentClientMock), '10s', '10s', logger)).toEqual(
          HealthStatus.HEALTHY
        )
      })
    })

    describe('when the service is bootstrapping', () => {
      const mockedBootstrappingStatus = {
        currentTime: 100,
        synchronizationStatus: 'Bootstrapping'
      }

      let fetchStub: sinon.SinonStub

      beforeAll(() => {
        contentClientMock = mock(SmartContentClient)
        when(contentClientMock.fetchContentStatus()).thenReturn(Promise.resolve(mockedBootstrappingStatus as any))
        when(contentClientMock.getClientUrl()).thenReturn(Promise.resolve('mockUrl'))
        fetchStub = sinon
          .stub(fetch, 'Promise' as any)
          .returns({ json: () => Promise.resolve(mockedBootstrappingStatus) })
      })

      afterAll(() => {
        fetchStub.restore()
      })

      it('should return an unhealthy status', async () => {
        const logger = mock(Logger)

        expect(await refreshContentServerStatus(instance(contentClientMock), '10s', '10s', logger)).toEqual(
          HealthStatus.UNHEALTHY
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

      let fetchStub: sinon.SinonStub

      beforeAll(() => {
        contentClientMock = mock(SmartContentClient)
        when(contentClientMock.fetchContentStatus()).thenReturn(Promise.resolve(mockedHealthyStatus as any))
        when(contentClientMock.getClientUrl()).thenReturn(Promise.resolve('mockUrl'))
        fetchStub = sinon.stub(fetch, 'Promise' as any).returns({ json: () => Promise.resolve(mockedHealthyStatus) })
      })

      afterAll(() => {
        fetchStub.restore()
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

      let fetchStub: sinon.SinonStub
      let dateNowStub: sinon.SinonStub

      beforeAll(() => {
        fetchStub = sinon.stub(fetch, 'Promise' as any).returns({ json: () => Promise.resolve(mockedHealthyStatus) })
        contentClientMock = mock(SmartContentClient)
        when(contentClientMock.fetchContentStatus()).thenReturn(Promise.resolve(mockedHealthyStatus as any))
        when(contentClientMock.getClientUrl()).thenReturn(Promise.resolve('mockUrl'))
        dateNowStub = sinon
          .stub(Date, 'now' as any)
          .onFirstCall()
          .returns(100)
          .onSecondCall()
          .returns(1000000)
      })

      afterAll(() => {
        fetchStub.restore()
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
      let fetchStub: sinon.SinonStub

      beforeAll(() => {
        fetchStub = sinon.stub(fetch, 'Promise' as any).throws(new Error('error'))
      })

      afterAll(() => {
        fetchStub.restore()
      })

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
