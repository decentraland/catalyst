import { createTestMetricsComponent } from '@well-known-components/metrics'
import { isEntityDeployed } from '../../../src/logic/deployments'
import { metricsDeclaration } from '../../../src/metrics'
import { createTestDatabaseComponent } from '../../../src/ports/postgres'

const metrics = createTestMetricsComponent(metricsDeclaration)

describe('isEntityDeployed', () => {
  it('when deployedEntitiesFilter returns true, then it should call the database', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 1})
    const deployedEntitiesFilter = deployedEntitiesFilterWithEntity('id')
    const metricsSpy = jest.spyOn(metrics, 'increment')
    const components = {
      metrics,
      database,
      deployedEntitiesFilter
    }
    await isEntityDeployed(components, 'id')
    expect(components.database.queryWithValues).toBeCalled()
    expect(metricsSpy).toBeCalledWith('dcl_deployed_entities_filter_checks_total', { false_positive: 'no' })
  })

  it('when deployedEntitiesFilter returns false, then it should not call the database', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 1})
    const metricsSpy = jest.spyOn(metrics, 'increment')
    const components = {
      metrics,
      database,
      deployedEntitiesFilter: {
        add: jest.fn(),
        check: jest.fn().mockResolvedValue(false)
      }
    }
    await isEntityDeployed(components, 'id')
    expect(components.database.queryWithValues).not.toBeCalled()
  })

  it('when deployedEntitiesFilter returns true and the entity exists in db, it should return true', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 1})
    const components = {
      metrics,
      database,
      deployedEntitiesFilter: {
        add: jest.fn(),
        check: jest.fn().mockResolvedValue(true)
      }
    }
    const isDeployed = await isEntityDeployed(components, 'id')
    expect(isDeployed).toBeTruthy()
  })

  it('when deployedEntitiesFilter returns true and the entity dont exists in db, it should return false', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 0})
    const components = {
      metrics,
      database,
      deployedEntitiesFilter: {
        add: jest.fn(),
        check: jest.fn().mockResolvedValue(true)
      }
    }
    const isDeployed = await isEntityDeployed(components, 'id')
    expect(isDeployed).toBeFalsy()
  })

  it('when deployedEntitiesFilter returns true and db too, then it should register as non false positive', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 1})
    const deployedEntitiesFilter = deployedEntitiesFilterWithEntity('id')
    const metricsSpy = jest.spyOn(metrics, 'increment')
    const components = {
      metrics,
      database,
      deployedEntitiesFilter
    }
    await isEntityDeployed(components, 'id')
    expect(metricsSpy).toBeCalledWith('dcl_deployed_entities_filter_checks_total', { false_positive: 'no' })
  })

  it('when deployedEntitiesFilter returns false, then it should register as non false positive', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 1})
    const deployedEntitiesFilter = deployedEntitiesFilterWithEntity('id')
    const metricsSpy = jest.spyOn(metrics, 'increment')
    const components = {
      metrics,
      database,
      deployedEntitiesFilter
    }
    await isEntityDeployed(components, 'another-id')
    expect(metricsSpy).toBeCalledWith('dcl_deployed_entities_filter_checks_total', { false_positive: 'no' })
  })

  it('when deployedEntitiesFilter returns true and db false, then it should register as false positive', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 0})
    const deployedEntitiesFilter = deployedEntitiesFilterWithEntity('id')
    const metricsSpy = jest.spyOn(metrics, 'increment')
    const components = {
      metrics,
      database,
      deployedEntitiesFilter
    }
    await isEntityDeployed(components, 'id')
    expect(metricsSpy).toBeCalledWith('dcl_deployed_entities_filter_checks_total', { false_positive: 'yes' })
  })
})

function deployedEntitiesFilterWithEntity(entityId: string) {
  return {
    add: jest.fn(),
    check: jest.fn((id) => Promise.resolve(id === entityId))
  }
}
