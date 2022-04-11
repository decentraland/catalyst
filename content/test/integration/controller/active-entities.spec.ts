import { Entity, EntityId, Pointer } from 'dcl-catalyst-commons'
import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import * as deployments from '../../../src/service/deployments/deployments'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData } from '../E2ETestUtils'
import { getIntegrationResourcePathFor } from '../resources/get-resources-path'
import { TestProgram } from '../TestProgram'

loadStandaloneTestEnvironment()('Integration - Get Active Entities', (testEnv) => {

  it('when asking without params, it returns client error', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
    makeNoopValidator(server.components)
    await server.startProgram()

    const result = await fetch(server.getUrl() + `/entities/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

    expect(result.status).toBe(400)
  })
  it('when asking by ID, it returns active entities with given ID', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata',
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })

    // Deploy entity
    await server.deploy(deployResult.deployData)

    const result = await fetchActiveEntityByIds(server, deployResult.entity.id)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(deployResult.entity.id)
  })

  it('when asking by Pointer, it returns active entities with given pointer', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata',
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]

    })

    // Deploy entity
    await server.deploy(deployResult.deployData)

    const result = await fetchActiveEntityByPointers(server, ...deployResult.entity.pointers)

    expect(result).toHaveLength(1)
    expect(result[0].pointers).toContain(deployResult.entity.pointers[0])
    expect(result[0].pointers).toContain(deployResult.entity.pointers[1])
  })

  it('when asking for active entities, only active entities are returned', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata',
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })

    // Deploy entity
    await server.deploy(deployResult.deployData)

    const newDeployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata 2',
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })

    // Deploy newer entity
    await server.deploy(newDeployResult.deployData)

    const result = await fetchActiveEntityByIds(server, newDeployResult.entity.id)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(newDeployResult.entity.id)
  })

  it('when there are multiple active entities, they are returned', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata',
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })

    // Deploy entity
    await server.deploy(deployResult.deployData)

    const deployResult2 = await buildDeployData(['2,0', '2,1'], {
      metadata: 'this is just some metadata',
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })

    // Deploy other entity
    await server.deploy(deployResult2.deployData)

    const result = await fetchActiveEntityByIds(server, deployResult.entity.id, deployResult2.entity.id)
    expect(result).toHaveLength(2)
    expect(result.some((entity) => entity.id === deployResult.entity.id)).toBeTruthy()
    expect(result.some((entity) => entity.id === deployResult2.entity.id)).toBeTruthy()
  })

  it('when asking with duplicated IDs, entity is returned once', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata',
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })

    // Deploy entity
    await server.deploy(deployResult.deployData)

    const result = await fetchActiveEntityByIds(server, deployResult.entity.id, deployResult.entity.id)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(deployResult.entity.id)
  })

  it('when asking with ID and pointer of same entity, result should be the same', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const pointers = ['0,0', '0,1']
    const deployResult = await buildDeployData(pointers, {
      metadata: 'this is just some metadata',
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })

    // Deploy entity
    await server.deploy(deployResult.deployData)
    const resultWithId = await fetchActiveEntityByIds(server, deployResult.entity.id)
    const resultWithPointers = await fetchActiveEntityByPointers(server, ...pointers)

    expect(JSON.stringify(resultWithId)).toBe(JSON.stringify(resultWithPointers))
  })

  describe('Active Entities cache', () => {
    it('when fetching active entity by ids, then entity is cached', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      makeNoopValidator(server.components)
      await server.startProgram()
      const pointers = ['0,0', '0,1']
      const deployResult = await buildDeployData(pointers, {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })

      // Deploy entity
      await server.deploy(deployResult.deployData)
      await fetchActiveEntityByIds(server, deployResult.entity.id)

      const zeroZeroActiveEntityId = server.components.activeEntities.getCachedEntity('0,0')
      const zeroOneActiveEntityId = server.components.activeEntities.getCachedEntity('0,1')
      expect(zeroZeroActiveEntityId).toBeDefined()
      expect(zeroOneActiveEntityId).toBeDefined()
      expect(zeroOneActiveEntityId).toBe(zeroZeroActiveEntityId)
      expect(zeroZeroActiveEntityId).toBe(deployResult.controllerEntity.id)
    })

    it('when fetching active entities by pointer but there is no one, then entity is cached as NOT_ACTIVE', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      makeNoopValidator(server.components)
      await server.startProgram()

      const somePointer = '0,0'
      const result = await fetchActiveEntityByPointers(server, somePointer)
      expect(result).toHaveLength(0)

      const entityId = server.components.activeEntities.getCachedEntity(somePointer)
      expect(entityId).toBe('NOT_ACTIVE_ENTITY')
    })

    it('when fetching active entities by id but there is no one, then is cached as NOT_ACTIVE', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      makeNoopValidator(server.components)
      await server.startProgram()

      const someId = 'someId'
      const result = await fetchActiveEntityByIds(server, someId)
      expect(result).toHaveLength(0)

      const cachedEntity = server.components.activeEntities.getCachedEntity(someId)
      expect(cachedEntity).toBeDefined()
      expect(cachedEntity).toBe('NOT_ACTIVE_ENTITY')
    })

    it('when overriding an entity, then cache is updated', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      makeNoopValidator(server.components)
      await server.startProgram()
      const pointers = ['0,0', '0,1']
      const { deployData } = await buildDeployData(pointers, {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })

      // Deploy entity with pointers ['0,0', '0,1']
      await server.deploy(deployData)

      const { deployData: secondDeployData } = await buildDeployData(['0,1'], {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })
      // Deploy entity with pointer ['0,1']
      await server.deploy(secondDeployData) // Override entity and invalidate pointer ['0,0']

      const result = await fetchActiveEntityByPointers(server, '0,0')
      expect(result).toHaveLength(0)

      const activeEntityForOverwrittenPointer = server.components.activeEntities.getCachedEntity('0,0')
      expect(activeEntityForOverwrittenPointer).toBe('NOT_ACTIVE_ENTITY')
    })

    it('when deploying a new entity with same pointer, then cache is updated', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      makeNoopValidator(server.components)
      await server.startProgram()
      const activeEntities = server.components.activeEntities
      const pointers = ['0,0', '0,1']
      const { deployData } = await buildDeployData(pointers, {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })

      // Deploy entity with pointers ['0,0', '0,1']
      await server.deploy(deployData)

      const result = await fetchActiveEntityByPointers(server, '0,0', '0,1')
      expect(result).toHaveLength(1)

      const entityId = activeEntities.getCachedEntity('0,0')
      const secondEntityId = activeEntities.getCachedEntity('0,1')
      expect(entityId).toBe(secondEntityId)
      expect(entityId).toBeDefined()
      expect(entityId).not.toBe('NOT_ACTIVE_ENTITY')

      const { deployData: secondDeployData } = await buildDeployData(pointers, {
        metadata: 'this is just some metadata 2',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })
      // Deploy new entity with pointers ['0,0', '0,1']
      await server.deploy(secondDeployData)
      const newEntityId = activeEntities.getCachedEntity('0,0')
      expect(newEntityId).toBeDefined()
      expect(newEntityId).not.toBe(entityId)
      expect(newEntityId).not.toBe('NOT_ACTIVE_ENTITY')
      expect(activeEntities.getCachedEntity('0,1')).toBe(newEntityId)

      const notActiveEntity = activeEntities.getCachedEntity(entityId)
      expect(notActiveEntity).toBe('NOT_ACTIVE_ENTITY')
    })

    it('when fetching multiple active entities, all are cached', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      makeNoopValidator(server.components)
      await server.startProgram()
      const activeEntities = server.components.activeEntities
      const firstPointers = ['0,0', '0,1']
      const { deployData } = await buildDeployData(firstPointers, {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })

      const secondPointers = ['0,2', '0,3']
      const { deployData: secondDeployData } = await buildDeployData(secondPointers, {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })

      await server.deploy(deployData)
      await server.deploy(secondDeployData)

      const result = await fetchActiveEntityByPointers(server, ...firstPointers, ...secondPointers)
      expect(result).toHaveLength(2)

      const firstEntityId = result[0].id
      const secondEntityId = result[1].id

      expect(firstEntityId).toBeDefined()
      expect(firstEntityId).not.toBe('NOT_ACTIVE_ENTITY')
      expect(secondEntityId).toBeDefined()
      expect(secondEntityId).not.toBe('NOT_ACTIVE_ENTITY')
    })

    it('when fetching a non active entity, result is cached', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      makeNoopValidator(server.components)
      await server.startProgram()

      const result = await fetchActiveEntityByIds(server, 'someId')
      expect(result).toHaveLength(0)

      // check cache
      expect(server.components.activeEntities.getCachedEntity('someId')).toBe('NOT_ACTIVE_ENTITY')
    })

    it('when results are cached, getDeployments is not called', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      makeNoopValidator(server.components)
      await server.startProgram()
      const pointers = ['0,0', '0,1']
      const { deployData } = await buildDeployData(pointers, {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })

      // Deploy entity with pointers ['0,0', '0,1']
      await server.deploy(deployData)

      const { deployData: secondDeployData } = await buildDeployData(['0,1'], {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })
      // Deploy entity with pointer ['0,1']
      await server.deploy(secondDeployData) // Override entity and invalidate pointer ['0,0']

      // given one active entity and one non active entity cached, check getDeployments is not being called
      const serviceSpy = jest.spyOn(deployments, 'getDeployments')
      const result = await fetchActiveEntityByPointers(server, '0,0', '0,1')
      expect(result).toHaveLength(1)
      expect(serviceSpy).not.toHaveBeenCalled()
    })
  })


  describe('Urn Prefix', () => {
    it('when fetching entities by invalid urn prefix, then a client error is returned', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      makeNoopValidator(server.components)
      await server.startProgram()

      const response = await fetch(server.getUrl() + `/entities/currently-pointed/in!valid`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
      })

      expect(response.status).toBe(400)
    })
    it('when fetching entities by urn prefix, then matching entity is retrieved', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      makeNoopValidator(server.components)
      await server.startProgram()
      const pointer = ['urn:dcl:collection:itemId']
      const deployResult = await buildDeployData(pointer, {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })

      // Deploy entity
      await server.deploy(deployResult.deployData)
      const response = await fetchActiveEntityByUrnPrefix(server, 'urn:dcl:collection')

      expect(response).toBeDefined()
      expect(response.length).toBe(1)
      expect(response[0].entityId).toBe(deployResult.controllerEntity.id)
      expect(response[0].pointer).toBe('urn:dcl:collection:itemid')
    })

    it('when fetching entities by not matching urn prefix, then none is retrieved', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      makeNoopValidator(server.components)
      await server.startProgram()
      const pointer = ['urn:dcl:collection:itemId']
      const deployResult = await buildDeployData(pointer, {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })

      // Deploy entity
      await server.deploy(deployResult.deployData)
      const response = await fetchActiveEntityByUrnPrefix(server, 'invalidPrefix')

      expect(response).toBeDefined()
      expect(response.length).toBe(0)
    })


    it('when pointer is updated and getting by prefix, the new one is retrieved', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      makeNoopValidator(server.components)
      await server.startProgram()
      const pointer = ['urn:dcl:collection:itemId']
      const firstDeploy = await buildDeployData(pointer, {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })
      const secondDeploy = await buildDeployData(pointer, {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })

      // Deploy entity
      await server.deploy(firstDeploy.deployData)
      await server.deploy(secondDeploy.deployData)
      const response = await fetchActiveEntityByUrnPrefix(server, 'urn:dcl:collection')

      expect(response).toBeDefined()
      expect(response.length).toBe(1)
      expect(response[0].entityId).toBe(secondDeploy.controllerEntity.id)
      expect(response[0].pointer).toBe('urn:dcl:collection:itemid')
    })

    it('when pointer is invalidated with deleter deployment, none is retrieved', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      makeNoopValidator(server.components)
      await server.startProgram()
      const pointers = ['0,0', '0,1']
      const firstDeploy = await buildDeployData(pointers, {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })
      const secondDeploy = await buildDeployData(['0,0'], {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })

      // Deploy entity
      await server.deploy(firstDeploy.deployData)
      await server.deploy(secondDeploy.deployData)
      const response = await fetchActiveEntityByUrnPrefix(server, '0')

      expect(response).toBeDefined()
      expect(response.length).toBe(1)
      expect(response[0].entityId).toBe(secondDeploy.controllerEntity.id)
      expect(response[0].pointer).toBe('0,0')
    })

   })

  async function fetchActiveEntityByIds(server: TestProgram, ...ids: string[]): Promise<Entity[]> {
    const url = server.getUrl() + `/entities/active`

    return (
      await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ ids }),
        headers: { 'Content-Type': 'application/json' }
      })
    ).json()
  }

  async function fetchActiveEntityByPointers(server: TestProgram, ...pointers: string[]): Promise<Entity[]> {
    const url = server.getUrl() + `/entities/active`

    return (
      await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ pointers }),
        headers: { 'Content-Type': 'application/json' }
      })
    ).json()
  }


  async function fetchActiveEntityByUrnPrefix(server: TestProgram, urnPrefix: string): Promise<{ pointer: Pointer; entityId: EntityId }[]> {
    const url = server.getUrl() + `/entities/currently-pointed/${urnPrefix}`

    return (
      await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
    ).json()
  }

})
