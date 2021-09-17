import { Server, WebSocket } from 'mock-socket'
import { Errors, MessageType } from '../../../../src/peerjs-server/enums'
import { Realm } from '../../../../src/peerjs-server/models/realm'
import { WebSocketServer } from '../../../../src/peerjs-server/services/webSocketServer'
import { numericIdGenerator } from '../../../../src/peerjs-server/utils/idgenerator'
import { wait } from '../../utils'

type Destroyable<T> = T & { destroy?: () => Promise<void> }

const checkOpen = async (c: WebSocket): Promise<boolean> => {
  return new Promise((resolve) => {
    c.onmessage = (event: any & { data?: string }): void => {
      c.onmessage = () => {}
      const message = JSON.parse(event.data as string)
      resolve(message.type === MessageType.OPEN)
    }
  })
}

const checkSequence = async (
  c: WebSocket,
  msgs: { type: MessageType; error?: Errors; payloadCheck?: (payload: any) => boolean }[]
): Promise<boolean> => {
  return new Promise((resolve) => {
    const restMessages = [...msgs]

    const finish = (success = false): void => {
      c.onmessage = () => {}
      resolve(success)
    }

    c.onmessage = (event: any & { data?: string }): void => {
      const [mes] = restMessages

      if (!mes) {
        return finish()
      }

      restMessages.shift()

      const message = JSON.parse(event.data as string)
      if (message.type !== mes.type) {
        return finish()
      }

      const isOk = !mes.error || message.payload?.msg === mes.error

      if (!isOk) {
        return finish()
      }

      const payloadOk = !mes.payloadCheck || mes.payloadCheck(message.payload)

      if (!payloadOk) {
        return finish()
      }

      if (restMessages.length === 0) {
        finish(true)
      }
    }
  })
}

const createTestServer = ({
  realm,
  config,
  url
}: {
  realm: Realm
  config: { path: string; key: string; concurrent_limit: number; idGenerator: () => string }
  url: string
}): Destroyable<WebSocketServer> => {
  const server = new Server(url)
  const webSocketServer: Destroyable<WebSocketServer> = new WebSocketServer({
    server,
    realm,
    config: { ...config, maxIdIterations: 100000 }
  })

  server.on('connection', (socket: WebSocket & { on?: (eventName: string, callback: () => void) => void }) => {
    const s = webSocketServer.socketServer
    s.emit('connection', socket, { url: socket.url })

    socket.onclose = (): void => {
      const userId = socket.url
        .split('?')[1]
        ?.split('&')
        .find((p) => p.startsWith('id'))
        ?.split('=')[1]

      if (!userId) return

      const client = realm.getClientById(userId)

      const clientSocket = client?.getSocket()

      if (!clientSocket) return
      ;(clientSocket as unknown as WebSocket).listeners['server::close']?.forEach((s: () => void) => s())
    }

    socket.onmessage = (event: any & { data?: string }): void => {
      const userId = socket.url
        .split('?')[1]
        ?.split('&')
        .find((p) => p.startsWith('id'))
        ?.split('=')[1]

      if (!userId) return

      const client = realm.getClientById(userId)

      const clientSocket = client?.getSocket()

      if (!clientSocket) return
      ;(clientSocket as unknown as WebSocket).listeners['server::message']?.forEach((s: (data: any) => void) =>
        s(event)
      )
    }
  })

  webSocketServer.destroy = async (): Promise<void> => {
    return new Promise((resolve) => {
      server.close()
      server.stop(() => resolve())
    })
  }

  return webSocketServer
}

describe('WebSocketServer', () => {
  it('should return valid path', () => {
    const realm = new Realm()
    const config = {
      path: '/',
      key: 'testKey',
      concurrent_limit: 1,
      idGenerator: numericIdGenerator(),
      maxIdIterations: 100000
    }
    const config2 = { ...config, path: 'path' }
    const server = new Server('path1')
    const server2 = new Server('path2')

    const webSocketServer = new WebSocketServer({ server, realm, config })

    expect(webSocketServer.path).toEqual('/peerjs')

    const webSocketServer2 = new WebSocketServer({ server: server2, realm, config: config2 })

    expect(webSocketServer2.path).toEqual('path/peerjs')

    server.stop()
    server2.stop()
  })

  it(`should check client's params`, async () => {
    const realm = new Realm()
    const config = { path: '/', key: 'testKey', concurrent_limit: 1, idGenerator: numericIdGenerator() }
    const fakeURL = 'ws://localhost:8080/peerjs'

    const getError = async (url: string, validError: Errors = Errors.INVALID_WS_PARAMETERS): Promise<boolean> => {
      const webSocketServer = createTestServer({ url, realm, config })

      const ws = new WebSocket(url)
      const errorSent = await checkSequence(ws, [{ type: MessageType.ERROR, error: validError }])

      ws.close()

      await webSocketServer.destroy?.()

      return errorSent
    }

    expect(await getError(fakeURL)).toBe(true)
    expect(await getError(`${fakeURL}?key=${config.key}`)).toBe(true)
    expect(await getError(`${fakeURL}?key=${config.key}&id=1`)).toBe(true)
    expect(await getError(`${fakeURL}?key=notValidKey&id=userId&token=userToken`, Errors.INVALID_KEY)).toBe(true)
  })

  it(`should assign a free id when no id is provided`, async () => {
    const realm = new Realm()
    const config = { path: '/', key: 'testKey', concurrent_limit: 1, idGenerator: numericIdGenerator() }
    const url = `ws://localhost:8080/peerjs?key=${config.key}&token=any`

    const webSocketServer = createTestServer({ url, realm, config })

    const ws = new WebSocket(url)

    const assignedIdReceived = await checkSequence(ws, [
      { type: MessageType.ASSIGNED_ID, payloadCheck: (payload) => payload.id === '1' }
    ])

    ws.close()

    await webSocketServer.destroy?.()

    expect(assignedIdReceived).toBe(true)
  })

  it(`should check concurrent limit`, async () => {
    const realm = new Realm()
    const config = { path: '/', key: 'testKey', concurrent_limit: 1, idGenerator: numericIdGenerator() }
    const fakeURL = 'ws://localhost:8080/peerjs'

    const createClient = (id: string): Destroyable<WebSocket> => {
      const url = `${fakeURL}?key=${config.key}&id=${id}&token=${id}`
      const webSocketServer = createTestServer({ url, realm, config })
      const ws: Destroyable<WebSocket> = new WebSocket(url)

      ws.destroy = async (): Promise<void> => {
        ws.close()

        await wait(10)

        await webSocketServer.destroy?.()

        await wait(10)

        ws.destroy = undefined
      }

      return ws
    }

    const c1 = createClient('1')

    expect(await checkOpen(c1)).toBe(true)

    const c2 = createClient('2')

    expect(await checkSequence(c2, [{ type: MessageType.ERROR, error: Errors.CONNECTION_LIMIT_EXCEED }])).toBe(true)

    await c1.destroy?.()
    await c2.destroy?.()

    await wait(10)

    expect(realm.getClientsIds().length).toEqual(0)

    const c3 = createClient('3')

    expect(await checkOpen(c3)).toBe(true)

    await c3.destroy?.()
  })
})
