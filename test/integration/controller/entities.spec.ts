import { makeNoopValidator } from '../../helpers/logic/server-validator/NoOpValidator'
import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'
import FormData = require('form-data')

describe('Integration - Entities', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  it('returns 500 when there is an exception while deploying the entity', async () => {
    jest.spyOn(server.components.deployer, 'deployEntity').mockRejectedValue({ error: 'error' })

    // Send a well-formed multipart body so the request actually reaches the deployer; the mocked
    // deployer then throws, which is what should surface as a 500. (A body-less request is instead a
    // 400 — a malformed client request never reaches deployment.)
    const form = buildValidEntityForm()
    const res = await fetch(server.getUrl() + `/entities`, {
      method: 'POST',
      body: form.getBuffer(),
      headers: form.getHeaders()
    })

    expect(res.status).toBe(500)
  })

  it('returns 400 when the request has no multipart/form-data body', async () => {
    const res = await fetch(server.getUrl() + `/entities`, { method: 'POST' })

    expect(res.status).toBe(400)
  })

  it('returns 400 when the multipart body is missing the required entityId field', async () => {
    const form = new FormData()
    form.append('files', Buffer.from('content'), { filename: 'entity.json' })

    const res = await fetch(server.getUrl() + `/entities`, {
      method: 'POST',
      body: form.getBuffer(),
      headers: form.getHeaders()
    })

    expect(res.status).toBe(400)
  })
})

function buildValidEntityForm(): FormData {
  const form = new FormData()
  form.append('entityId', 'QmTestEntityId')
  form.append('files', Buffer.from('content'), { filename: 'entity.json' })
  form.append(
    'authChain',
    JSON.stringify([
      { type: 'SIGNER', payload: '0x716954738e57686a08902d9dd586e813490fee23' },
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
    ])
  )
  return form
}
