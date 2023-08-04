import { EntityType } from '@dcl/schemas'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { Deployment, DeploymentOptions, PartialDeploymentHistory } from '../../../src/deployment-types'
import { ContentFilesRow } from '../../../src/logic/database-queries/content-files-queries'
import { HistoricalDeploymentsRow } from '../../../src/logic/database-queries/deployments-queries'
import { MigrationDataRow } from '../../../src/logic/database-queries/migration-data-queries'
import { getCuratedLimit, getCuratedOffset, getDeployments, MAX_HISTORY_LIMIT } from '../../../src/logic/deployments'
import { metricsDeclaration } from '../../../src/metrics'
import { AppComponents } from '../../../src/types'

describe('deployments service', () => {
  describe('getDeployments', () => {
    let components: Pick<AppComponents, 'database' | 'denylist' | 'metrics'>
    let result: PartialDeploymentHistory<Deployment>

    const deploymentIds = [127, 255]

    const historicalDeploymentsRows: HistoricalDeploymentsRow[] = [
      {
        auth_chain: [],
        deleter_deployment: 1,
        deployer_address: '1',
        entity_id: '1',
        entity_metadata: {},
        entity_pointers: ['0,0'],
        entity_timestamp: Date.now(),
        entity_type: EntityType.SCENE,
        id: deploymentIds[0],
        local_timestamp: Date.now(),
        version: 'v3'
      },
      {
        auth_chain: [],
        deleter_deployment: 1,
        deployer_address: '2',
        entity_id: '2',
        entity_metadata: {},
        entity_pointers: ['0,1'],
        entity_timestamp: Date.now(),
        entity_type: EntityType.SCENE,
        id: deploymentIds[1],
        local_timestamp: Date.now(),
        version: 'v3'
      }
    ]

    const contentFiles: ContentFilesRow[] = [
      {
        content_hash: 'hash',
        deployment: deploymentIds[0],
        key: 'key'
      },
      {
        content_hash: 'hash1',
        deployment: deploymentIds[1],
        key: 'key1'
      }
    ]

    const migrationData: MigrationDataRow[] = [
      {
        deployment: deploymentIds[0],
        original_metadata: []
      },
      {
        deployment: deploymentIds[1],
        original_metadata: []
      }
    ]

    const options: DeploymentOptions = {
      filters: {
        from: Date.now(),
        to: Date.now()
      }
    }

    describe('when no item is denylisted', () => {
      beforeAll(() => {
        components = {
          database: { queryWithValues: () => {} },
          denylist: { isDenylisted: () => false },
          metrics: createTestMetricsComponent(metricsDeclaration)
        }
        vi.spyOn(components.database, 'queryWithValues')
          .mockResolvedValueOnce({ rows: historicalDeploymentsRows, rowCount: 2 })
          .mockResolvedValueOnce({ rows: contentFiles, rowCount: 2 })
          .mockResolvedValueOnce({ rows: migrationData, rowCount: 2 })
      })

      it('should return the deployments result of passing the correct filters to get the historical deployments', async () => {
        result = await getDeployments(components, components.database, options)

        expect(result).toEqual(
          expect.objectContaining({
            deployments: expect.arrayContaining([
              expect.objectContaining({ entityId: historicalDeploymentsRows[0].entity_id }),
              expect.objectContaining({ entityId: historicalDeploymentsRows[1].entity_id })
            ]),
            filters: options.filters
          })
        )
      })
    })

    describe('with a denylisted item', () => {
      beforeAll(() => {
        components = {
          database: { queryWithValues: () => {} },
          denylist: { isDenylisted: () => false },
          metrics: createTestMetricsComponent(metricsDeclaration)
        }
        vi.spyOn(components.database, 'queryWithValues')
          .mockResolvedValueOnce({ rows: historicalDeploymentsRows, rowCount: 2 })
          .mockResolvedValueOnce({ rows: contentFiles, rowCount: 2 })
          .mockResolvedValueOnce({ rows: migrationData, rowCount: 2 })
      })

      it("should not return a deployment if it's denylisted", async () => {
        vi.spyOn(components.denylist, 'isDenylisted').mockReturnValueOnce(true).mockReturnValueOnce(false)
        result = await getDeployments(components, components.database, options)

        expect(result).toEqual(
          expect.objectContaining({
            deployments: expect.arrayContaining([
              expect.objectContaining({ entityId: historicalDeploymentsRows[1].entity_id })
            ]),
            filters: options.filters
          })
        )
      })
    })

    describe('with a denylisted item but with includeDenylisted param', () => {
      beforeAll(() => {
        components = {
          database: { queryWithValues: () => {} },
          denylist: { isDenylisted: () => false },
          metrics: createTestMetricsComponent(metricsDeclaration)
        }
        vi.spyOn(components.database, 'queryWithValues')
          .mockResolvedValueOnce({ rows: historicalDeploymentsRows, rowCount: 2 })
          .mockResolvedValueOnce({ rows: contentFiles, rowCount: 2 })
          .mockResolvedValueOnce({ rows: migrationData, rowCount: 2 })
      })

      it("should not return a deployment if it's denylisted", async () => {
        vi.spyOn(components.denylist, 'isDenylisted').mockReturnValueOnce(true).mockReturnValueOnce(false)
        result = await getDeployments(components, components.database, { ...options, includeDenylisted: true })

        expect(result).toEqual(
          expect.objectContaining({
            deployments: expect.arrayContaining([
              expect.objectContaining({ entityId: historicalDeploymentsRows[0].entity_id }),
              expect.objectContaining({ entityId: historicalDeploymentsRows[1].entity_id })
            ]),
            filters: options.filters
          })
        )
      })
    })
  })

  describe('getCuratedOffset', () => {
    describe('when options is undefined', () => {
      it('should return 0', () => {
        expect(getCuratedOffset(undefined)).toEqual(0)
      })
    })
    describe("when it doesn't have offset", () => {
      it('should return 0', () => {
        expect(getCuratedOffset({})).toEqual(0)
      })
    })
    describe('when it has offset', () => {
      it('should return the value', () => {
        expect(getCuratedOffset({ offset: 104 })).toEqual(104)
      })
    })
  })

  describe('getCuratedLimit', () => {
    describe('when options is undefined', () => {
      it('should return the max limit', () => {
        expect(getCuratedLimit(undefined)).toEqual(MAX_HISTORY_LIMIT)
      })
    })

    describe('when the offset is greater than the max limit', () => {
      it('should return the max limit', () => {
        expect(getCuratedLimit({ limit: MAX_HISTORY_LIMIT + 1 })).toEqual(MAX_HISTORY_LIMIT)
      })
    })

    describe('when the offset is lower than the max limit', () => {
      it('should return the offset', () => {
        expect(getCuratedLimit({ limit: 27 })).toEqual(27)
      })
    })
  })
})
