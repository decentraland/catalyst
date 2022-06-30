import fetch from 'node-fetch';
import { EnvironmentConfig } from '../../../src/Environment';
import { createFsComponent } from '../../../src/ports/fs';
import { makeNoopServerValidator, makeNoopValidator } from '../../helpers/service/validations/NoOpValidator';
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment';
import { getIntegrationResourcePathFor } from '../resources/get-resource-path';
import { TestProgram } from '../TestProgram';
import FormData = require("form-data");

interface ActivePointersRow {
  entity_id: string,
  pointer: string
}

const fs = createFsComponent()

loadStandaloneTestEnvironment()('Integration - Create entities', (testEnv) => {

  let server: TestProgram

  beforeEach(async () => {
    // Initialize server
    server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
    makeNoopValidator(server.components)
    makeNoopServerValidator(server.components)
    await server.startProgram()
  })

  afterEach(async () => {
    await server.stopProgram()
  })

  it('when creating a profile, pointer should be stored in active-pointers table', async () => {
    // Create profile
    const form = createForm('bafkreigiffn5v5j5o2rd24dvirirggghisva44owomrl65dqg5flan47le', 'profile_original.json');
    const response = await callCreateEntityEndpoint(server, form)

    // Check that response is correct
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('creationTimestamp')

    // Check that entity_id matches only with the profile pointer
    let queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreigiffn5v5j5o2rd24dvirirggghisva44owomrl65dqg5flan47le'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].pointer).toBe('0x31a19cb92ac89f1aa62fa72da5f52521daf130b0')

    // Check that profile pointer matches only with the entity_id
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='0x31a19cb92ac89f1aa62fa72da5f52521daf130b0'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].entity_id).toBe('bafkreigiffn5v5j5o2rd24dvirirggghisva44owomrl65dqg5flan47le')
  })

  it('when overwriting a profile, entity id should be replaced in active-pointers table', async () => {
    // Create profile
    let form = createForm('bafkreigiffn5v5j5o2rd24dvirirggghisva44owomrl65dqg5flan47le', 'profile_original.json');
    let response = await callCreateEntityEndpoint(server, form)

    // Check that response is correct
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('creationTimestamp')

    // Overwrite profile
    form = createForm('bafkreiczclosnorj7bzibuvotiwf2gyvtmnxmyvl62nacpxhluqsi72bxq', 'profile_overwrite.json');
    response = await callCreateEntityEndpoint(server, form)

    // Check that response is correct
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('creationTimestamp')

    // Check that entity_id matches only with the profile pointer
    let queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreiczclosnorj7bzibuvotiwf2gyvtmnxmyvl62nacpxhluqsi72bxq'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].pointer).toBe('0x31a19cb92ac89f1aa62fa72da5f52521daf130b0')

    // Check that profile pointer matches only with the entity_id
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='0x31a19cb92ac89f1aa62fa72da5f52521daf130b0'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].entity_id).toBe('bafkreiczclosnorj7bzibuvotiwf2gyvtmnxmyvl62nacpxhluqsi72bxq')

    // Check that old pointers were deleted
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy'")
    expect(queryResult.rowCount).toBe(0)
  })

  it('when overwriting a profile, new profile must be ignored if its timestamp is older', async () => {
    // Create profile
    let form = createForm('bafkreiczclosnorj7bzibuvotiwf2gyvtmnxmyvl62nacpxhluqsi72bxq', 'profile_overwrite.json');
    let response = await callCreateEntityEndpoint(server, form)

    // Check that response is correct
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('creationTimestamp')

    // Try to overwrite it with a profile with older timestamp
    form = createForm('bafkreigiffn5v5j5o2rd24dvirirggghisva44owomrl65dqg5flan47le', 'profile_original.json');
    response = await callCreateEntityEndpoint(server, form)

    // Check that response is correct
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('creationTimestamp')

    // Check that entity_id matches only with the profile pointer
    let queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreiczclosnorj7bzibuvotiwf2gyvtmnxmyvl62nacpxhluqsi72bxq'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].pointer).toBe('0x31a19cb92ac89f1aa62fa72da5f52521daf130b0')

    // Check that profile pointer matches only with the entity_id
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='0x31a19cb92ac89f1aa62fa72da5f52521daf130b0'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].entity_id).toBe('bafkreiczclosnorj7bzibuvotiwf2gyvtmnxmyvl62nacpxhluqsi72bxq')

    // Check that old pointer was never added
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy'")
    expect(queryResult.rowCount).toBe(0)
  })

  it('when creating a scene, pointers should be stored in active-pointers table', async () => {
    // Create scene
    const form = createForm('bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy', 'scene_original.json');
    const response = await callCreateEntityEndpoint(server, form)

    // Assert response
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('creationTimestamp')

    // Check that entity_id matches only with the scene pointers
    let queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy'")
    expect(queryResult.rowCount).toBe(2)
    expect(queryResult.rows[0].pointer).toBe('0,0')
    expect(queryResult.rows[1].pointer).toBe('0,1')

    // Check that scene pointers match only with the entity_id
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='0,0'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].entity_id).toBe('bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy')
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='0,1'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].entity_id).toBe('bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy')
  })

  it('when overwriting a scene, unused pointers should be deleted from active-pointers table', async () => {
    // Create scene
    let form = createForm('bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy', 'scene_original.json');
    let response = await callCreateEntityEndpoint(server, form)

    await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy'")

    // Assert response
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('creationTimestamp')

    // Overwrite scene
    form = createForm('bafkreiccs3djm6cfhucvena5ay5qoybf76vdqaeido53azizw4zb2myqjq', 'scene_overwrite.json');
    response = await callCreateEntityEndpoint(server, form)

    // Assert response
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('creationTimestamp')

    // Check that scene pointers match only with the entity_id
    let queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='0,0'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].entity_id).toBe('bafkreiccs3djm6cfhucvena5ay5qoybf76vdqaeido53azizw4zb2myqjq')
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='1,0'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].entity_id).toBe('bafkreiccs3djm6cfhucvena5ay5qoybf76vdqaeido53azizw4zb2myqjq')

    // Check that old pointers were deleted
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy'")
    expect(queryResult.rowCount).toBe(0)
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='0,1'")
    expect(queryResult.rowCount).toBe(0)

    // Check that entity_id matches scene pointers
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreiccs3djm6cfhucvena5ay5qoybf76vdqaeido53azizw4zb2myqjq'")
    expect(queryResult.rowCount).toBe(2)
    expect(queryResult.rows[0].pointer).toBe('0,0')
    expect(queryResult.rows[1].pointer).toBe('1,0')
  })


  it('when overwriting multiple scenes, unused pointers should be deleted from active-pointers table', async () => {
    // Create scene
    let form = createForm('bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy', 'scene_original.json');
    let response = await callCreateEntityEndpoint(server, form)
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('creationTimestamp')

    let queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy'")
    expect(queryResult.rowCount).toBe(2)
    expect(queryResult.rows[0].pointer).toBe('0,0')
    expect(queryResult.rows[1].pointer).toBe('0,1')


    // new non-overlapping scene
    form = createForm('bafkreihubgrgjjz55sbzd5jq5fr4qucz37preqnwcggznzrlatpmz4n3sa', 'another_scene.json');
    response = await callCreateEntityEndpoint(server, form)
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('creationTimestamp')

    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreihubgrgjjz55sbzd5jq5fr4qucz37preqnwcggznzrlatpmz4n3sa'")
    expect(queryResult.rowCount).toBe(2)
    expect(queryResult.rows[0].pointer).toBe('1,0')
    expect(queryResult.rows[1].pointer).toBe('1,1')


    // Overwrite scene
    form = createForm('bafkreiccs3djm6cfhucvena5ay5qoybf76vdqaeido53azizw4zb2myqjq', 'scene_overwrite.json');
    response = await callCreateEntityEndpoint(server, form)

    // Assert response
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('creationTimestamp')

    // Check that scene pointers match only with the entity_id
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='0,0'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].entity_id).toBe('bafkreiccs3djm6cfhucvena5ay5qoybf76vdqaeido53azizw4zb2myqjq')
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='1,0'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].entity_id).toBe('bafkreiccs3djm6cfhucvena5ay5qoybf76vdqaeido53azizw4zb2myqjq')

    // Check that old pointers were deleted
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy'")
    expect(queryResult.rowCount).toBe(0)
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='0,1'")
    expect(queryResult.rowCount).toBe(0)
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreihubgrgjjz55sbzd5jq5fr4qucz37preqnwcggznzrlatpmz4n3sa'")
    expect(queryResult.rowCount).toBe(0)
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='1,1'")
    expect(queryResult.rowCount).toBe(0)

    // Check that entity_id matches scene pointers
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreiccs3djm6cfhucvena5ay5qoybf76vdqaeido53azizw4zb2myqjq'")
    expect(queryResult.rowCount).toBe(2)
    expect(queryResult.rows[0].pointer).toBe('0,0')
    expect(queryResult.rows[1].pointer).toBe('1,0')
  })

  it('when overwriting a scene, new scene must be ignored if its timestamp is older', async () => {
    // Create scene
    let form = createForm('bafkreiccs3djm6cfhucvena5ay5qoybf76vdqaeido53azizw4zb2myqjq', 'scene_overwrite.json');
    let response = await callCreateEntityEndpoint(server, form)

    // Assert response
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('creationTimestamp')

    // Try to overwrite it with a scene with older timestamp
    form = createForm('bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy', 'scene_original.json');
    response = await callCreateEntityEndpoint(server, form)

    // Assert response
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('creationTimestamp')

    // Check that entity_id matches scene pointers
    let queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreiccs3djm6cfhucvena5ay5qoybf76vdqaeido53azizw4zb2myqjq'")
    expect(queryResult.rowCount).toBe(2)
    expect(queryResult.rows[0].pointer).toBe('0,0')
    expect(queryResult.rows[1].pointer).toBe('1,0')

    // Check that scene pointers match only with the entity_id
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='0,0'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].entity_id).toBe('bafkreiccs3djm6cfhucvena5ay5qoybf76vdqaeido53azizw4zb2myqjq')
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='1,0'")
    expect(queryResult.rowCount).toBe(1)
    expect(queryResult.rows[0].entity_id).toBe('bafkreiccs3djm6cfhucvena5ay5qoybf76vdqaeido53azizw4zb2myqjq')

    // Check that old pointers were never added
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where entity_id='bafkreigaea5hghqlq2462z5ltdaeualenzjtm44xl3hhog4lxzoh7ooliy'")
    expect(queryResult.rowCount).toBe(0)
    queryResult = await server.components.database.query<ActivePointersRow>("select * from active_pointers where pointer='0,1'")
    expect(queryResult.rowCount).toBe(0)
  })
})

function createForm(entityId: string, filename: string) {
  // Instantiate form
  const form = new FormData();

  // Add entityId
  form.append('entityId', entityId);

  // Add entity file
  const entityFile = fs.createReadStream(getIntegrationResourcePathFor(filename));
  form.append('files', entityFile);

  // Add authChain. Just as a example
  const authChain = [
    {
      type: "SIGNER",
      payload: "0x716954738e57686a08902d9dd586e813490fee23"
    },
    {
      type: "ECDSA_EPHEMERAL",
      payload: "Decentraland Login\nEphemeral address: 0x90a43461d3e970785B945FFe8f7628F2BC962D6a\nExpiration: 2021-07-10T20:55:42.215Z",
      signature: "0xe64e46fdd7d8789c0debec54422ae77e31b77e5a28287e072998e1114e252c57328c17756400d321e9e77032347c9d05e63fb59a3b6c3ab754565f9db86b8c481b"
    },
    {
      type: "ECDSA_SIGNED_ENTITY",
      payload: "QmNMZBy7khBxdigikA8mcJMyv6yeBXfMv3iAcUiBr6n72C",
      signature: "0xbed22719dcdc19580353108027c41c65863404879592c65014d806efa961c629777adc76986193eaee4e48f278ec59feb1c289827254230af85b2955157ec8061b"
    }
  ];
  form.append('authChain', JSON.stringify(authChain));

  return form;
}

async function callCreateEntityEndpoint(server: TestProgram, form: FormData) {
  return await fetch(`${server.getUrl()}/entities`, { method: 'POST', body: form});
}
