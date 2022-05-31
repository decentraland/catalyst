import { EntityType } from '@dcl/schemas'
import { fetchJson, SortingField, SortingOrder } from 'dcl-catalyst-commons'
import { DeploymentField } from '../../../src/controller/Controller'
import { EnvironmentConfig } from '../../../src/Environment'
import { toQueryParams } from '../../../src/logic/toQueryParams'
import { DeploymentOptions } from '../../../src/service/deployments/types'
import { PointerChangesFilters } from '../../../src/service/pointers/types'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData, EntityCombo } from '../E2ETestUtils'
import { TestProgram } from '../TestProgram'

loadStandaloneTestEnvironment()('Integration - Deployment Pagination', (testEnv) => {
  let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo

  let server: TestProgram

  beforeEach(async () => {
    server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
    makeNoopValidator(server.components)
    await server.startProgram()
  })

  beforeAll(async () => {
    const P1 = 'X1,Y1'
    const P2 = 'X2,Y2'
    const P3 = 'X3,Y3'
    const type = EntityType.PROFILE

    const timestamp = Date.now()
    const a = await buildDeployData([P1], { type, timestamp, metadata: { a: 'metadata1' } })
    const b = await buildDeployData([P2], { type, timestamp, metadata: { a: 'metadata2' } })
    if (a.entity.id.toLowerCase() < b.entity.id.toLowerCase()) {
      E1 = a
      E2 = b
    } else {
      E1 = b
      E2 = a
    }
    E3 = await buildDeployData([P3], { type, timestamp: timestamp + 1, metadata: { a: 'metadata3' } })
  })

  it('given local timestamp and asc when getting two elements the next link page is correct', async () => {
    // Deploy E2, E3, E1 in that order
    const [, E3Timestamp] = await deploy(E2, E3, E1)

    const actualDeployments = await fetchDeployments({
      limit: 2,
      sortBy: {
        order: SortingOrder.ASCENDING,
        field: SortingField.LOCAL_TIMESTAMP
      }
    })

    expect(actualDeployments.deployments.length).toBe(2)
    expect(actualDeployments.deployments[0].entityId).toBe(E2.entity.id)
    expect(actualDeployments.deployments[1].entityId).toBe(E3.entity.id)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).toContain(`from=${E3Timestamp}`)
    expect(nextLink).toContain(`lastId=${E3.entity.id}`)
  })

  it('given local timestamp and desc when getting two elements the next link page is correct', async () => {
    // Deploy E2, E3, E1 in that order
    const [, E3Timestamp] = await deploy(E2, E3, E1)

    const actualDeployments = await fetchDeployments({
      limit: 2,
      sortBy: {
        order: SortingOrder.DESCENDING,
        field: SortingField.LOCAL_TIMESTAMP
      }
    })

    expect(actualDeployments.deployments.length).toBe(2)
    expect(actualDeployments.deployments[0].entityId).toBe(E1.entity.id)
    expect(actualDeployments.deployments[1].entityId).toBe(E3.entity.id)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).toContain(`to=${E3Timestamp}`)
    expect(nextLink).toContain(`lastId=${E3.entity.id}`)
  })

  it('given entity timestamp and asc when getting two elements the next link page is correct', async () => {
    // Deploy E2, E3, E1 in that order
    await deploy(E2, E3, E1)

    const actualDeployments = await fetchDeployments({
      limit: 2,
      sortBy: {
        order: SortingOrder.ASCENDING,
        field: SortingField.ENTITY_TIMESTAMP
      }
    })

    expect(actualDeployments.deployments.length).toBe(2)
    expect(actualDeployments.deployments[0].entityId).toBe(E1.entity.id)
    expect(actualDeployments.deployments[1].entityId).toBe(E2.entity.id)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).toContain(`from=${E2.entity.timestamp}`)
    expect(nextLink).toContain(`lastId=${E2.entity.id}`)
  })

  it('given entity timestamp and desc when getting two elements the next link page is correct', async () => {
    // Deploy E2, E3, E1 in that order
    await deploy(E2, E3, E1)

    const actualDeployments = await fetchDeployments({
      limit: 2,
      sortBy: {
        order: SortingOrder.DESCENDING,
        field: SortingField.ENTITY_TIMESTAMP
      }
    })

    expect(actualDeployments.deployments.length).toBe(2)
    expect(actualDeployments.deployments[0].entityId).toBe(E3.entity.id)
    expect(actualDeployments.deployments[1].entityId).toBe(E2.entity.id)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).toContain(`to=${E2.entity.timestamp}`)
    expect(nextLink).toContain(`lastId=${E2.entity.id}`)
  })

  it('When there is no next page then the link is undefined', async () => {
    // Deploy E1, E2 and E3 in that order
    await deploy(E1, E2, E3)

    const actualDeployments = await fetchDeployments({
      limit: 3
    })

    expect(actualDeployments.deployments.length).toBe(3)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).toBeUndefined()
  })

  it('When limit is set, then in next it persists', async () => {
    // Deploy E1, E2 and E3 in that order
    await deploy(E1, E2, E3)

    const actualDeployments = await fetchDeployments({
      limit: 2
    })

    expect(actualDeployments.deployments.length).toBe(2)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).toContain('limit=2')
  })

  it('When no fields are set, then next does not have them either', async () => {
    // Deploy E1, E2 and E3 in that order
    await deploy(E1, E2, E3)

    const actualDeployments = await fetchDeployments({
      limit: 2
    })

    expect(actualDeployments.deployments.length).toBe(2)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).not.toContain('fields')
  })

  it('When fields are set, then next shows the same fields', async () => {
    // Deploy E1, E2 and E3 in that order
    await deploy(E1, E2, E3)

    const actualDeployments = await fetchDeployments({
      limit: 2,
      fields: [DeploymentField.CONTENT, DeploymentField.AUDIT_INFO]
    })

    expect(actualDeployments.deployments.length).toBe(2)
    const nextLink = actualDeployments.pagination.next
    expect(decodeURIComponent(nextLink)).toContain(`fields=${DeploymentField.CONTENT},${DeploymentField.AUDIT_INFO}`)
  })

  it('When getting by last entityId then it returns the correct page', async () => {
    // Deploy E1, E2 in that order
    await deploy(E1, E2)

    const actualDeployments = await fetchDeployments({
      limit: 2,
      sortBy: {
        field: SortingField.ENTITY_TIMESTAMP,
        order: SortingOrder.ASCENDING
      },
      lastId: E1.entity.id,
      filters: { from: E1.entity.timestamp }
    })

    const deployments = actualDeployments.deployments

    expect(deployments.length).toBe(1)
    expect(deployments[0].entityId).toBe(`${E2.entity.id}`)
  })

  it('When from is set, then only to is modified in next ', async () => {
    // Deploy E1, E2 and E3 in that order
    const [E1Timestamp, E2Timestamp, E3Timestamp] = await deploy(E1, E2, E3)

    const actualDeployments = await fetchDeployments({
      limit: 2,
      filters: { from: E1Timestamp, to: E3Timestamp }
    })

    expect(actualDeployments.deployments.length).toBe(2)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).toContain(`from=${E1Timestamp}`)
    expect(nextLink).toContain(`to=${E2Timestamp}`)
    expect(nextLink).toContain(`lastId=${E2.entity.id}`)
  })

  it('When getting pointer changes then the pagination is correctly done', async () => {
    // Deploy E1, E2 in that order
    const [E1Timestamp, E2Timestamp] = await deploy(E1, E2)

    const pointerChanges = await fetchPointerChanges({ from: E1Timestamp }, 1)

    expect(pointerChanges.deltas.length).toBe(1)
    expect(pointerChanges.pagination.next).toContain(`to=${E2Timestamp}`)
    expect(pointerChanges.pagination.next).toContain(`from=${E1Timestamp}`)
    expect(pointerChanges.pagination.next).toContain(`lastId=${E2.entity.id}`)
  })

  async function deploy(...entities: EntityCombo[]): Promise<number[]> {
    const timestamps: number[] = []
    for (const { deployData } of entities) {
      const deploymentResult = await server.deploy(deployData)
      timestamps.push(deploymentResult)
    }
    return timestamps
  }

  async function fetchDeployments(options: DeploymentOptions) {
    const composedOptions = {
      ...options.filters,
      sortingField: options.sortBy?.field,
      sortingOrder: options.sortBy?.order,
      fields: options.fields ? options.fields.join(',') : undefined
    }
    const newOptions = Object.assign({}, options)
    newOptions.sortBy = undefined
    newOptions.filters = undefined
    const url =
      server.getUrl() +
      `/deployments?` +
      toQueryParams({
        ...newOptions,
        ...composedOptions
      })
    return fetchJson(url) as any
  }

  async function fetchPointerChanges(filters: PointerChangesFilters, limit: number) {
    const url = server.getUrl() + `/pointer-changes?` + toQueryParams({ ...filters, limit: limit })
    return fetchJson(url) as any
  }
})
