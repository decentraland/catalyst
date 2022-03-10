import { createTestMetricsComponent } from '@well-known-components/metrics'
import { Deployment, EntityType, EntityVersion, PartialDeploymentHistory } from 'dcl-catalyst-commons'
import { safe } from 'jest-extra-utils'
import { restore, stub } from 'sinon'
import { ContentFilesRow } from '../../../../src/logic/database-queries/content-files-queries'
import { HistoricalDeploymentsRow } from '../../../../src/logic/database-queries/deployments-queries'
import { MigrationDataRow } from '../../../../src/logic/database-queries/migration-data-queries'
import { metricsDeclaration } from '../../../../src/metrics'
import {
  getCuratedLimit,
  getCuratedOffset,
  getDeployments,
  MAX_HISTORY_LIMIT
} from '../../../../src/service/deployments/deployments'
import { DeploymentOptions } from '../../../../src/service/deployments/types'
import { AppComponents } from '../../../../src/types'

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
        version: EntityVersion.V3
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
        version: EntityVersion.V3
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
          database: safe({ queryWithValues: () => {} }),
          denylist: { isDenyListed: () => false },
          metrics: createTestMetricsComponent(metricsDeclaration)
        }
        stub(components.database, 'queryWithValues')
          .onFirstCall()
          .resolves({ rows: historicalDeploymentsRows, rowCount: 2 })
          .onSecondCall()
          .resolves({ rows: contentFiles, rowCount: 2 })
          .onThirdCall()
          .resolves({ rows: migrationData, rowCount: 2 })
      })

      afterAll(() => {
        restore()
      })

      it('should return the deployments result of passing the correct filters to get the historical deployments', async () => {
        result = await getDeployments(components, options)

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
          database: safe({ queryWithValues: () => {} }),
          denylist: { isDenyListed: () => false },
          metrics: createTestMetricsComponent(metricsDeclaration)
        }
        stub(components.database, 'queryWithValues')
          .onFirstCall()
          .resolves({ rows: historicalDeploymentsRows, rowCount: 2 })
          .onSecondCall()
          .resolves({ rows: contentFiles, rowCount: 2 })
          .onThirdCall()
          .resolves({ rows: migrationData, rowCount: 2 })
      })

      afterAll(() => {
        restore()
      })

      it("should not return a deployment if it's denylisted", async () => {
        stub(components.denylist, 'isDenyListed').onFirstCall().returns(true).returns(false)
        result = await getDeployments(components, options)

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
          database: safe({ queryWithValues: () => {} }),
          denylist: { isDenyListed: () => false },
          metrics: createTestMetricsComponent(metricsDeclaration)
        }
        stub(components.database, 'queryWithValues')
          .onFirstCall()
          .resolves({ rows: historicalDeploymentsRows, rowCount: 2 })
          .onSecondCall()
          .resolves({ rows: contentFiles, rowCount: 2 })
          .onThirdCall()
          .resolves({ rows: migrationData, rowCount: 2 })
      })

      afterAll(() => {
        restore()
      })

      it("should not return a deployment if it's denylisted", async () => {
        stub(components.denylist, 'isDenyListed').onFirstCall().returns(true).returns(false)
        result = await getDeployments(components, { ...options, includeDenylisted: true })

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
