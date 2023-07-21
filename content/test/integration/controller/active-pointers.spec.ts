import { createFsComponent } from '@dcl/catalyst-storage'
import fetch from 'node-fetch'
import { stopAllComponents } from '../../../src/logic/components-lifecycle'
import { makeNoopServerValidator, makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { getIntegrationResourcePathFor } from '../resources/get-resource-path'
import { TestProgram } from '../TestProgram'
import FormData = require('form-data')
import { resetServer, createDefaultServer } from '../simpleTestEnvironment'
import LeakDetector from 'jest-leak-detector'

interface ActivePointersRow {
  entity_id: string
  pointer: string
}

interface DeploymentsRow {
  entity_id: string
  deleter_entity_id: string
}

const fs = createFsComponent()
const profileAddress = '0x31a19cb92ac89f1aa62fa72da5f52521daf130b0'
const originalProfileEntityId = 'bafkreigiffn5v5j5o2rd24dvirirggghisva44owomrl65dqg5flan47le'
const profileOverwriteEntityId = 'bafkreiczclosnorj7bzibuvotiwf2gyvtmnxmyvl62nacpxhluqsi72bxq'

describe('Integration - Create entities', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
    makeNoopServerValidator(server.components)
  })

  beforeEach(() => resetServer(server))

  afterAll(async () => {
    jest.restoreAllMocks()
    stopAllComponents({ fs })
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  it('when creating a profile, pointer should be stored in active-pointers table', async () => {
    // Create profile
    const form = createForm(originalProfileEntityId, 'profile_original.json')
    await callCreateEntityEndpoint(server, form)

    // Check that entity_id matches only with the profile pointer
    await assertQueryResultPointers(originalProfileEntityId, [profileAddress])

    // Check that profile pointer matches only with the entity_id
    await assertQueryResultEntityIds(profileAddress, [originalProfileEntityId])
  })

  it('when overwriting a profile, entity id should be replaced in active-pointers table', async () => {
    // Create profile
    let form = createForm(originalProfileEntityId, 'profile_original.json')
    await callCreateEntityEndpoint(server, form)

    // Overwrite profile
    form = createForm(profileOverwriteEntityId, 'profile_overwrite.json')
    await callCreateEntityEndpoint(server, form)

    // Check that entity_id matches only with the profile pointer
    await assertQueryResultPointers(profileOverwriteEntityId, [profileAddress])

    // Check that profile pointer matches only with the entity_id
    await assertQueryResultEntityIds(profileAddress, [profileOverwriteEntityId])

    // Check that old pointers were deleted
    await assertQueryResultPointers(originalProfileEntityId, [])
  })

  it('when overwriting a profile, new profile must be ignored if its timestamp is older', async () => {
    // Create profile
    let form = createForm(profileOverwriteEntityId, 'profile_overwrite.json')
    await callCreateEntityEndpoint(server, form)

    // Try to overwrite it with a profile with older timestamp
    form = createForm(originalProfileEntityId, 'profile_original.json')
    await callCreateEntityEndpoint(server, form)

    // Check that entity_id matches only with the profile pointer
    await assertQueryResultPointers(profileOverwriteEntityId, [profileAddress])

    // Check that profile pointer matches only with the entity_id
    await assertQueryResultEntityIds(profileAddress, [profileOverwriteEntityId])

    // Check that old pointer was never added
    await assertQueryResultPointers(originalProfileEntityId, [])
  })

  const originalSceneEntityId = 'bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy'
  const overwriteSceneEntityId = 'bafkreiccs3djm6cfhucvena5ay5qoybf76vdqaeido53azizw4zb2myqjq'
  const anotherSceneEntityId = 'bafkreihubgrgjjz55sbzd5jq5fr4qucz37preqnwcggznzrlatpmz4n3sa'

  it('when creating a scene, pointers should be stored in active-pointers table', async () => {
    // Create scene
    const form = createForm(originalSceneEntityId, 'scene_original.json')
    await callCreateEntityEndpoint(server, form)

    // Check that entity_id matches only with the scene pointers
    await assertQueryResultPointers(originalSceneEntityId, ['0,0', '0,1'])

    // Check that scene pointers match only with the entity_id
    await assertQueryResultEntityIds('0,0', [originalSceneEntityId])

    await assertQueryResultEntityIds('0,1', [originalSceneEntityId])
  })

  it('when overwriting a scene, unused pointers should be deleted from active-pointers table', async () => {
    // Create scene
    let form = createForm(originalSceneEntityId, 'scene_original.json')
    await callCreateEntityEndpoint(server, form)

    // Overwrite scene
    form = createForm(overwriteSceneEntityId, 'scene_overwrite.json')
    await callCreateEntityEndpoint(server, form)

    // Check that scene pointers match only with the entity_id
    await assertQueryResultEntityIds('0,0', [overwriteSceneEntityId])
    await assertQueryResultEntityIds('1,0', [overwriteSceneEntityId])

    // Check that old pointers were deleted
    await assertQueryResultPointers(originalSceneEntityId, [])
    await assertQueryResultEntityIds('0,1', [])

    // Check that entity_id matches scene pointers
    await assertQueryResultPointers(overwriteSceneEntityId, ['0,0', '1,0'])
  })

  it('when overwriting multiple scenes, unused pointers should be deleted from active-pointers table', async () => {
    // Create scene
    let form = createForm(originalSceneEntityId, 'scene_original.json')
    await callCreateEntityEndpoint(server, form)

    // Check that scene pointers match only with the entity_id
    await assertQueryResultPointers(originalSceneEntityId, ['0,0', '0,1'])

    // Create a second scene (non-overlapping)
    form = createForm(anotherSceneEntityId, 'another_scene.json')
    await callCreateEntityEndpoint(server, form)

    // Check that scene pointers match only with the entity_id
    await assertQueryResultPointers(anotherSceneEntityId, ['1,0', '1,1'])

    // Create a scene that overwrites the two previous ones
    form = createForm(overwriteSceneEntityId, 'scene_overwrite.json')
    await callCreateEntityEndpoint(server, form)

    // Check that scene pointers match only with the entity_id
    await assertQueryResultEntityIds('0,0', [overwriteSceneEntityId])
    await assertQueryResultEntityIds('1,0', [overwriteSceneEntityId])

    // Check that entity_id matches scene pointers
    await assertQueryResultPointers(overwriteSceneEntityId, ['0,0', '1,0'])

    // Check that old pointers were deleted
    await assertQueryResultPointers(originalSceneEntityId, [])
    await assertQueryResultEntityIds('0,1', [])
    await assertQueryResultPointers(anotherSceneEntityId, [])
    await assertQueryResultEntityIds('1,1', [])

    await assertDeleterDeployment(originalSceneEntityId, overwriteSceneEntityId)
    await assertDeleterDeployment(anotherSceneEntityId, overwriteSceneEntityId)
  })

  it('when overwriting a scene, new scene must be ignored if its timestamp is older', async () => {
    // Create scene
    let form = createForm(overwriteSceneEntityId, 'scene_overwrite.json')
    await callCreateEntityEndpoint(server, form)

    // Try to overwrite it with a scene with older timestamp
    form = createForm(originalSceneEntityId, 'scene_original.json')
    await callCreateEntityEndpoint(server, form)

    // Check that entity_id matches scene pointers
    await assertQueryResultPointers(overwriteSceneEntityId, ['0,0', '1,0'])

    // Check that scene pointers match only with the entity_id
    await assertQueryResultEntityIds('0,0', [overwriteSceneEntityId])
    await assertQueryResultEntityIds('1,0', [overwriteSceneEntityId])

    // Check that old pointers were never added
    await assertQueryResultPointers(originalSceneEntityId, [])
    await assertQueryResultEntityIds('0,1', [])
  })

  async function assertQueryResultPointers(entityId: string, pointers: string[]) {
    let queryResult = await server.components.database.query<ActivePointersRow>(
      `select * from active_pointers where entity_id='${entityId}'`
    )
    expect(queryResult.rowCount).toBe(pointers.length)
    pointers.forEach((pointer, index) => expect(queryResult.rows[index].pointer).toBe(pointer))
  }

  async function assertQueryResultEntityIds(pointer: string, entityIds: string[]) {
    let queryResult = await server.components.database.query<ActivePointersRow>(
      `select * from active_pointers where pointer='${pointer}'`
    )
    expect(queryResult.rowCount).toBe(entityIds.length)
    entityIds.forEach((entityId, index) => expect(queryResult.rows[index].entity_id).toBe(entityId))
  }

  async function assertDeleterDeployment(entityId: string, deleterDeploymentId: string) {
    let queryResult = await server.components.database.query<DeploymentsRow>(
      `select dep1.*, dep2.entity_id as deleter_entity_id from deployments dep1 inner join deployments dep2 on dep1.deleter_deployment = dep2.id where dep1.entity_id='${entityId}'`
    )
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].deleter_entity_id).toBe(deleterDeploymentId)
  }
})

function createForm(entityId: string, filename: string) {
  // Instantiate form
  const form = new FormData()

  // Add entityId
  form.append('entityId', entityId)

  // Add entity file
  const entityFile = fs.createReadStream(getIntegrationResourcePathFor(filename))
  form.append('files', entityFile)

  // Add authChain. Just as a example
  const authChain = [
    {
      type: 'SIGNER',
      payload: '0x716954738e57686a08902d9dd586e813490fee23'
    },
    {
      type: 'ECDSA_EPHEMERAL',
      payload:
        'Decentraland Login\nEphemeral address: 0x90a43461d3e970785B945FFe8f7628F2BC962D6a\nExpiration: 2021-07-10T20:55:42.215Z',
      signature:
        '0xe64e46fdd7d8789c0debec54422ae77e31b77e5a28287e072998e1114e252c57328c17756400d321e9e77032347c9d05e63fb59a3b6c3ab754565f9db86b8c481b'
    },
    {
      type: 'ECDSA_SIGNED_ENTITY',
      payload: 'QmNMZBy7khBxdigikA8mcJMyv6yeBXfMv3iAcUiBr6n72C',
      signature:
        '0xbed22719dcdc19580353108027c41c65863404879592c65014d806efa961c629777adc76986193eaee4e48f278ec59feb1c289827254230af85b2955157ec8061b'
    }
  ]
  form.append('authChain', JSON.stringify(authChain))

  return form
}

async function callCreateEntityEndpoint(server: TestProgram, form: FormData) {
  const response = await fetch(`${server.getUrl()}/entities`, { method: 'POST', body: form })
  expect(response.status).toBe(200)
  expect(await response.json()).toHaveProperty('creationTimestamp')
}
