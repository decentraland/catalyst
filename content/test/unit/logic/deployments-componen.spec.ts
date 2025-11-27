import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  buildDeploymentFromHistoricalDeployment,
  buildHistoricalDeploymentsFromRow,
  createDeploymentsComponent,
  IDeploymentsComponent
} from '../../../src/logic/deployments'
import { IDatabaseComponent } from '../../../src/ports/postgres'
import { createDatabaseMockedComponent } from '../../mocks/database-component-mock'
import {
  createHistoricalDeploymentRowWithContentMock,
  createLogsMockedComponent
} from '../../mocks/logger-component-mock'
import { HistoricalDeploymentsRow } from '../../../src/logic/database-queries/deployments-queries'
import { DeploymentContent } from '../../../src/deployment-types'
import { DeploymentId } from '../../../src/types'

let deployments: IDeploymentsComponent
let database: jest.Mocked<IDatabaseComponent>
let queryWithValuesMock: jest.Mocked<IDatabaseComponent>['queryWithValues']
let infoMock: jest.MockedFn<ILoggerComponent.ILogger['info']>
let queryMock: jest.Mocked<IDatabaseComponent>['query']

beforeEach(() => {
  infoMock = jest.fn()
  queryMock = jest.fn()
  queryWithValuesMock = jest.fn()
  database = createDatabaseMockedComponent({ queryWithValues: queryWithValuesMock, query: queryMock })
  const logs = createLogsMockedComponent({ info: infoMock })
  deployments = createDeploymentsComponent({ database, logs })
})

describe('when getting the deployments for active third party collection items by entity ids', () => {
  describe('when the entity ids are not found', () => {
    beforeEach(() => {
      queryWithValuesMock.mockResolvedValue({ rows: [], rowCount: 0 })
    })

    it('should return an empty array', async () => {
      const result = await deployments.getDeploymentsForActiveThirdPartyItemsByEntityIds(['123'])
      expect(result).toEqual([])
    })
  })

  describe('when entity ids are found', () => {
    let rowEntities: HistoricalDeploymentsRow[]
    let contents: Map<DeploymentId, DeploymentContent[]>

    beforeEach(() => {
      contents = new Map([
        [
          1,
          [
            { key: '1', hash: 'hash1' },
            { key: '2', hash: 'hash2' }
          ]
        ],
        [
          2,
          [
            { key: '3', hash: 'hash3' },
            { key: '4', hash: 'hash4' }
          ]
        ]
      ])

      rowEntities = [
        createHistoricalDeploymentRowWithContentMock({
          id: 1,
          entity_id: '123',
          content_keys: ['1', '2'],
          content_hashes: ['hash1', 'hash2']
        }),
        createHistoricalDeploymentRowWithContentMock({
          id: 2,
          entity_id: '456',
          content_keys: ['3', '4'],
          content_hashes: ['hash3', 'hash4']
        })
      ]

      queryWithValuesMock.mockResolvedValue({
        rows: rowEntities,
        rowCount: 2
      })
    })

    it('should return the deployments', async () => {
      const result = await deployments.getDeploymentsForActiveThirdPartyItemsByEntityIds(['123', '456'])
      expect(result).toEqual([
        buildDeploymentFromHistoricalDeployment(buildHistoricalDeploymentsFromRow(rowEntities[0]), contents),
        buildDeploymentFromHistoricalDeployment(buildHistoricalDeploymentsFromRow(rowEntities[1]), contents)
      ])
    })
  })
})

describe('when updating the materialized views', () => {
  beforeEach(() => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })
  })

  it('should update the materialized views', async () => {
    await deployments.updateMaterializedViews()
    expect(queryMock).toHaveBeenCalledWith(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY active_third_party_collection_items_deployments_with_content'
    )
  })
})
