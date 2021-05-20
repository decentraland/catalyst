// import { Controller } from '@katalyst/lambdas/controller/Controller'
import { Controller } from '@katalyst/lambdas/controller/Controller'
import { HealthStatus } from '@katalyst/lambdas/utils/ControllerUtils'
import fetch from 'node-fetch'
import sinon from 'sinon'

fdescribe("Lambda's Controller Utils", () => {
  // let controller: Controller

  describe('HealthStatus', () => {
    describe('compare', () => {
      describe('when comparing a Healthy and a Loaded', () => {
        it('should return the Healthy is lower than the Loaded', () => {
          expect(HealthStatus.compare(HealthStatus.HEALTHY, HealthStatus.UNHEALTHY)).toEqual(-1)
        })
      })

      describe('when comparing a Loaded and a Unhealthy', () => {
        it('should return the Loaded is lower than the Unhealthy', () => {
          expect(HealthStatus.compare(HealthStatus.LOADED, HealthStatus.UNHEALTHY)).toEqual(-1)
        })
      })

      describe('when comparing a Unhealthy and a Down', () => {
        it('should return the Unhealthy is lower than the Down', () => {
          expect(HealthStatus.compare(HealthStatus.UNHEALTHY, HealthStatus.DOWN)).toEqual(-1)
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
    let controller: Controller

    it('test', () => {
      sinon.stub(fetch, 'Promise' as any).returns(Promise.resolve({ json: async () => HealthStatus.LOADED }))

      // when(fetchSpy.default(anything())).thenReturn(Promise.resolve({ json: () => Promise.resolve }) as any)
      const commsUrl = 'localhost'

      controller = new Controller({ getClientUrl: () => 'mockUrl' } as any, {} as any, 10, 10, commsUrl)
      expect(controller).not.toBeNull()
    })
  })
})
