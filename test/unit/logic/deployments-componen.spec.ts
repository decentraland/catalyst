import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  createDeploymentsComponent,
  IDeploymentsComponent,
  ThirdPartyItemDeploymentRow
} from '../../../src/logic/deployments'
import { IDatabaseComponent } from '../../../src/adapters/database'
import { createDatabaseMockedComponent } from '../../mocks/database-component-mock'
import { createThirdPartyItemDeploymentRowMock, createLogsMockedComponent } from '../../mocks/logger-component-mock'

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
    let rowEntities: ThirdPartyItemDeploymentRow[]

    beforeEach(() => {
      rowEntities = [
        createThirdPartyItemDeploymentRowMock({
          deployment_id: 1,
          entity_id: '123',
          content_keys: ['1', '2'],
          content_hashes: ['hash1', 'hash2']
        }),
        createThirdPartyItemDeploymentRowMock({
          deployment_id: 2,
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
        expect.objectContaining({ entityId: '123' }),
        expect.objectContaining({ entityId: '456' })
      ])
    })

    it('should return each deployment with its own content files', async () => {
      const result = await deployments.getDeploymentsForActiveThirdPartyItemsByEntityIds(['123', '456'])
      expect(result[0].content).toEqual([
        { key: '1', hash: 'hash1' },
        { key: '2', hash: 'hash2' }
      ])
      expect(result[1].content).toEqual([
        { key: '3', hash: 'hash3' },
        { key: '4', hash: 'hash4' }
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
