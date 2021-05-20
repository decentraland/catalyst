// import { Controller } from '@katalyst/lambdas/controller/Controller'

import { HealthStatus, refreshContentServerStatus } from '@katalyst/lambdas/utils/health'
import { Logger } from 'log4js'
import fetch from 'node-fetch'
import sinon from 'sinon'
import { mock } from 'ts-mockito'

describe("Lambda's Controller Utils", () => {
  describe('HealthStatus', () => {
    describe('compare', () => {
      describe('when comparing a Healthy and a Loaded', () => {
        it('should return the Healthy is lower than the Loaded', () => {
          expect(HealthStatus.compare(HealthStatus.HEALTHY, HealthStatus.UNHEALTHY)).toEqual(-1)
          expect(HealthStatus.compare(HealthStatus.UNHEALTHY, HealthStatus.HEALTHY)).toEqual(1)
        })
      })

      describe('when comparing a Loaded and a Unhealthy', () => {
        it('should return the Loaded is lower than the Unhealthy', () => {
          expect(HealthStatus.compare(HealthStatus.LOADED, HealthStatus.UNHEALTHY)).toEqual(-1)
          expect(HealthStatus.compare(HealthStatus.UNHEALTHY, HealthStatus.LOADED)).toEqual(1)
        })
      })

      describe('when comparing a Unhealthy and a Down', () => {
        it('should return the Unhealthy is lower than the Down', () => {
          expect(HealthStatus.compare(HealthStatus.UNHEALTHY, HealthStatus.DOWN)).toEqual(-1)
          expect(HealthStatus.compare(HealthStatus.DOWN, HealthStatus.UNHEALTHY)).toEqual(1)
        })
      })

      describe('when comparing two equal states', () => {
        it('should return 0', () => {
          expect(HealthStatus.compare(HealthStatus.UNHEALTHY, HealthStatus.UNHEALTHY)).toEqual(0)
        })
      })
    })
  })

  describe('refreshContentServerStatus', () => {
    describe('when the service is synced', () => {
      const mockedHealthyStatus = {
        currentTime: 100,
        synchronizationStatus: {
          lastSyncWithOtherServers: 100
        }
      }

      let fetchStub: sinon.SinonStub

      beforeAll(() => {
        fetchStub = sinon.stub(fetch, 'Promise' as any).returns({ json: () => Promise.resolve(mockedHealthyStatus) })
      })

      afterAll(() => {
        fetchStub.restore()
      })

      it('should return a healthy status', async () => {
        const logger = mock(Logger)

        expect(
          await refreshContentServerStatus({ getClientUrl: () => Promise.resolve('mockUrl') } as any, 10, 10, logger)
        ).toEqual(HealthStatus.HEALTHY)
      })
    })

    describe('when the service is bootstrapping', () => {
      const mockedBootstrappingStatus = {
        currentTime: 100,
        synchronizationStatus: 'Bootstrapping'
      }

      let fetchStub: sinon.SinonStub

      beforeAll(() => {
        fetchStub = sinon
          .stub(fetch, 'Promise' as any)
          .returns({ json: () => Promise.resolve(mockedBootstrappingStatus) })
      })

      afterAll(() => {
        fetchStub.restore()
      })

      it('should return an unhealthy status', async () => {
        const logger = mock(Logger)

        expect(
          await refreshContentServerStatus({ getClientUrl: () => Promise.resolve('mockUrl') } as any, 10, 10, logger)
        ).toEqual(HealthStatus.UNHEALTHY)
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
        fetchStub = sinon.stub(fetch, 'Promise' as any).returns({ json: () => Promise.resolve(mockedHealthyStatus) })
      })

      afterAll(() => {
        fetchStub.restore()
      })

      it('should return an unhealthy status', async () => {
        const logger = mock(Logger)

        expect(
          await refreshContentServerStatus({ getClientUrl: () => Promise.resolve('mockUrl') } as any, 10, 10, logger)
        ).toEqual(HealthStatus.UNHEALTHY)
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

      it('should return a loaded status', async () => {
        const logger = mock(Logger)

        expect(
          await refreshContentServerStatus({ getClientUrl: () => Promise.resolve('mockUrl') } as any, 10, 10, logger)
        ).toEqual(HealthStatus.LOADED)
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
          await refreshContentServerStatus({ getClientUrl: () => Promise.resolve('mockUrl') } as any, 10, 10, logger)
        ).toEqual(HealthStatus.DOWN)
      })
    })
  })
})
