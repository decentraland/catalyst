import { createTestMetricsComponent } from '@well-known-components/metrics'
import { isEntityDeployed } from '../../../src/logic/deployments'
import { metricsDeclaration } from '../../../src/metrics'
import { createTestDatabaseComponent } from '../../../src/ports/postgres'

const metrics = createTestMetricsComponent(metricsDeclaration)

describe('isEntityDeployed', () => {
  it('when deployedEntitiesBloomFilter returns true, then it should call the database', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 1})
    const deployedEntitiesBloomFilter = deployedEntitiesBloomFilterWithEntity('id')
    const metricsSpy = jest.spyOn(metrics, 'increment')
    const components = {
      metrics,
      database,
      deployedEntitiesBloomFilter
    }
    await isEntityDeployed(components, 'id')
    expect(components.database.queryWithValues).toBeCalled()
    expect(metricsSpy).toBeCalledWith('dcl_deployed_entities_bloom_filter_checks_total', { hit: 'true' })
  })

  it('when deployedEntitiesBloomFilter returns false, then it should not call the database', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 1})
    const metricsSpy = jest.spyOn(metrics, 'increment')
    const components = {
      metrics,
      database,
      deployedEntitiesBloomFilter: {
        add: jest.fn(),
        check: jest.fn().mockResolvedValue(false)
      }
    }
    await isEntityDeployed(components, 'id')
    expect(components.database.queryWithValues).not.toBeCalled()
  })

  it('when deployedEntitiesBloomFilter returns true and the entity exists in db, it should return true', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 1})
    const components = {
      metrics,
      database,
      deployedEntitiesBloomFilter: {
        add: jest.fn(),
        check: jest.fn().mockResolvedValue(true)
      }
    }
    const isDeployed = await isEntityDeployed(components, 'id')
    expect(isDeployed).toBeTruthy()
  })

  it('when deployedEntitiesBloomFilter returns true and the entity dont exists in db, it should return false', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 0})
    const components = {
      metrics,
      database,
      deployedEntitiesBloomFilter: {
        add: jest.fn(),
        check: jest.fn().mockResolvedValue(true)
      }
    }
    const isDeployed = await isEntityDeployed(components, 'id')
    expect(isDeployed).toBeFalsy()
  })

  it('when deployedEntitiesBloomFilter returns true and db too, then it should register as non false positive', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 1})
    const deployedEntitiesBloomFilter = deployedEntitiesBloomFilterWithEntity('id')
    const metricsSpy = jest.spyOn(metrics, 'increment')
    const components = {
      metrics,
      database,
      deployedEntitiesBloomFilter: deployedEntitiesBloomFilter
    }
    await isEntityDeployed(components, 'id')
    expect(metricsSpy).toBeCalledWith('dcl_deployed_entities_bloom_filter_checks_total', { hit: 'true' })
  })

  it('when deployedEntitiesBloomFilter returns false, then it should register as non false positive', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 1})
    const deployedEntitiesBloomFilter = deployedEntitiesBloomFilterWithEntity('id')
    const metricsSpy = jest.spyOn(metrics, 'increment')
    const components = {
      metrics,
      database,
      deployedEntitiesBloomFilter
    }
    await isEntityDeployed(components, 'another-id')
    expect(metricsSpy).toBeCalledWith('dcl_deployed_entities_bloom_filter_checks_total', { hit: 'true' })
  })

  it('when deployedEntitiesBloomFilter returns true and db false, then it should register as false positive', async () => {
    const database = createTestDatabaseComponent()
    database.queryWithValues = jest.fn().mockResolvedValue({rowCount: 0})
    const deployedEntitiesBloomFilter = deployedEntitiesBloomFilterWithEntity('id')
    const metricsSpy = jest.spyOn(metrics, 'increment')
    const components = {
      metrics,
      database,
      deployedEntitiesBloomFilter
    }
    await isEntityDeployed(components, 'id')
    expect(metricsSpy).toBeCalledWith('dcl_deployed_entities_bloom_filter_checks_total', { hit: 'false' })
  })
})

function deployedEntitiesBloomFilterWithEntity(entityId: string) {
  return {
    add: jest.fn(),
    check: jest.fn((id) => Promise.resolve(id === entityId))
  }
}
