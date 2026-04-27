import { HistoricalDeployment } from '../../../../src/adapters/deployments-repository'
import { getPointerChanges } from '../../../../src/service/pointers/pointers'
import * as deploymentsQueries from '../../../../src/adapters/deployments-repository'
import { Denylist } from '../../../../src/adapters/denylist'

function buildDeployment(entityId: string, overrides: Partial<HistoricalDeployment> = {}): HistoricalDeployment {
  return {
    deploymentId: Math.random(),
    entityId,
    entityType: 'scene',
    pointers: ['0,0'],
    entityTimestamp: Date.now(),
    localTimestamp: Date.now(),
    metadata: {},
    deployerAddress: '0x1',
    version: 'v3',
    authChain: [],
    ...overrides
  }
}

describe('getPointerChanges', () => {
  let denylist: Denylist
  let database: { queryWithValues: jest.Mock }
  let getHistoricalDeploymentsSpy: jest.SpyInstance

  beforeEach(() => {
    denylist = { isDenylisted: jest.fn().mockReturnValue(false) }
    database = { queryWithValues: jest.fn() }
    getHistoricalDeploymentsSpy = jest.spyOn(deploymentsQueries, 'getHistoricalDeployments')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when the database returns more rows than the limit', () => {
    describe('and some rows are denylisted', () => {
      let result: Awaited<ReturnType<typeof getPointerChanges>>

      beforeEach(async () => {
        const limit = 3
        const deployments = [
          buildDeployment('entity-1'),
          buildDeployment('entity-2-denied'),
          buildDeployment('entity-3'),
          buildDeployment('entity-4')
        ]

        getHistoricalDeploymentsSpy.mockResolvedValueOnce(deployments)
        ;(denylist.isDenylisted as jest.Mock).mockImplementation(
          (id: string) => id === 'entity-2-denied'
        )

        result = await getPointerChanges(
          { denylist, metrics: { increment: jest.fn() } as any },
          database as any,
          { limit }
        )
      })

      it('should set moreData to true based on pre-filter count', () => {
        expect(result.pagination.moreData).toBe(true)
      })

      it('should return only non-denylisted deployments up to the limit', () => {
        expect(result.pointerChanges.every((d) => d.entityId !== 'entity-2-denied')).toBe(true)
      })
    })
  })

  describe('when the database returns exactly the limit number of rows', () => {
    let result: Awaited<ReturnType<typeof getPointerChanges>>

    beforeEach(async () => {
      const limit = 3
      const deployments = [
        buildDeployment('entity-1'),
        buildDeployment('entity-2'),
        buildDeployment('entity-3')
      ]

      getHistoricalDeploymentsSpy.mockResolvedValueOnce(deployments)

      result = await getPointerChanges(
        { denylist, metrics: { increment: jest.fn() } as any },
        database as any,
        { limit }
      )
    })

    it('should set moreData to false', () => {
      expect(result.pagination.moreData).toBe(false)
    })
  })
})
