import express from 'express'
import { Server } from 'net'
import { IConfig } from './config'
import { MessageHandler } from './messageHandler'
import { IClient } from './models/client'
import { IMessage } from './models/message'
import { IRealm, Realm } from './models/realm'
import { CheckBrokenConnections } from './services/checkBrokenConnections'
import { IMessagesExpire, MessagesExpire } from './services/messagesExpire'
import { IWebSocketServer, WebSocketServer } from './services/webSocketServer'

export const createInstance = ({
  app,
  server,
  options
}: {
  app: express.Application
  server: Server
  options: IConfig
}): void => {
  const config = options
  const realm: IRealm = new Realm()

  app.set('peerjs-realm', realm)

  const messageHandler = new MessageHandler(realm, config)

  const messagesExpire: IMessagesExpire = new MessagesExpire({ realm, config, messageHandler })
  const checkBrokenConnections = new CheckBrokenConnections({
    realm,
    config,
    onClose: (client) => {
      app.emit('disconnect', client)
    }
  })

  const wss: IWebSocketServer = new WebSocketServer({
    server,
    realm,
    config
  })

  function handleError(runnable: () => Promise<any>) {
    runnable().catch((e) => wss.emit('error', e))
  }

  wss.on('connection', (client: IClient) =>
    handleError(async () => {
      const messageQueue = realm.getMessageQueueById(client.getId())

      if (messageQueue) {
        let message: IMessage | undefined

        while ((message = messageQueue.readMessage())) {
          await messageHandler.handle(client, message)
        }
        realm.clearMessageQueue(client.getId())
      }

      app.emit('connection', client)
    })
  )

  wss.on('message', (client: IClient, message: IMessage) =>
    handleError(async () => {
      app.emit('message', client, message)
      await messageHandler.handle(client, message)
    })
  )

  wss.on('close', (client: IClient) => {
    app.emit('disconnect', client)
  })

  wss.on('error', (error: Error) => {
    app.emit('error', error)
  })

  messagesExpire.startMessagesExpiration()
  checkBrokenConnections.start()
}
