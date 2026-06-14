import { getDeploymentsHandler } from '../../../src/controllers/handlers/get-deployments-handler'
import { getEntitiesHandler } from '../../../src/controllers/handlers/get-entities-handler'
import { getFailedDeploymentsHandler } from '../../../src/controllers/handlers/failed-deployments-handler'
import { createQueryParams } from '../../../src/logic/query-params'
import { HandlerContextWithPath } from '../../../src/types'

describe('when enforcing request-array limits on read handlers', () => {
  describe('and requesting deployments with more filter values than allowed', () => {
    let context: HandlerContextWithPath<any, '/deployments'>

    beforeEach(() => {
      const pointers = Array.from({ length: 1001 }, (_, i) => `pointer=0,${i}`).join('&')
      context = {
        components: { queryParams: createQueryParams() },
        url: new URL(`http://localhost/deployments?${pointers}`)
      } as unknown as HandlerContextWithPath<any, '/deployments'>
    })

    it('should respond with a 400 before running any query', async () => {
      const response = await getDeploymentsHandler(context)
      expect(response.status).toBe(400)
    })
  })

  describe('and requesting entities with more pointers than allowed', () => {
    let context: HandlerContextWithPath<any, '/entities/:type'>

    beforeEach(() => {
      const pointers = Array.from({ length: 1001 }, (_, i) => `pointer=0,${i}`).join('&')
      context = {
        params: { type: 'scene' },
        components: { queryParams: createQueryParams() },
        url: new URL(`http://localhost/entities/scene?${pointers}`)
      } as unknown as HandlerContextWithPath<any, '/entities/:type'>
    })

    it('should respond with a 400 before running any query', async () => {
      const response = await getEntitiesHandler(context)
      expect(response.status).toBe(400)
    })
  })
})

describe('when paginating failed deployments', () => {
  let failedDeployments: { getAllFailedDeployments: jest.Mock }
  let allFailedDeployments: any[]

  beforeEach(() => {
    allFailedDeployments = [{ entityId: 'a' }, { entityId: 'b' }, { entityId: 'c' }, { entityId: 'd' }]
    failedDeployments = { getAllFailedDeployments: jest.fn().mockResolvedValue(allFailedDeployments) }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and no pagination params are provided', () => {
    let context: HandlerContextWithPath<any, '/failed-deployments'>

    beforeEach(() => {
      context = {
        components: { failedDeployments, queryParams: createQueryParams() },
        url: new URL('http://localhost/failed-deployments')
      } as unknown as HandlerContextWithPath<any, '/failed-deployments'>
    })

    it('should return the full set of failed deployments', async () => {
      const response = await getFailedDeploymentsHandler(context)
      expect(response.body).toEqual(allFailedDeployments)
    })
  })

  describe('and only a limit is provided', () => {
    let context: HandlerContextWithPath<any, '/failed-deployments'>

    beforeEach(() => {
      context = {
        components: { failedDeployments, queryParams: createQueryParams() },
        url: new URL('http://localhost/failed-deployments?limit=2')
      } as unknown as HandlerContextWithPath<any, '/failed-deployments'>
    })

    it('should return only the first page of results', async () => {
      const response = await getFailedDeploymentsHandler(context)
      expect(response.body).toEqual(allFailedDeployments.slice(0, 2))
    })
  })

  describe('and both an offset and a limit are provided', () => {
    let context: HandlerContextWithPath<any, '/failed-deployments'>

    beforeEach(() => {
      context = {
        components: { failedDeployments, queryParams: createQueryParams() },
        url: new URL('http://localhost/failed-deployments?offset=1&limit=2')
      } as unknown as HandlerContextWithPath<any, '/failed-deployments'>
    })

    it('should return the requested slice of results', async () => {
      const response = await getFailedDeploymentsHandler(context)
      expect(response.body).toEqual(allFailedDeployments.slice(1, 3))
    })
  })
})
