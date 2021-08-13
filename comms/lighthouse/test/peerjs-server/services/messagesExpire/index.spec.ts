import defaultConfig from '../../../../src/peerjs-server/config'
import { MessageType } from '../../../../src/peerjs-server/enums'
import { MessageHandler } from '../../../../src/peerjs-server/messageHandler'
import { IMessage } from '../../../../src/peerjs-server/models/message'
import { Realm } from '../../../../src/peerjs-server/models/realm'
import { MessagesExpire } from '../../../../src/peerjs-server/services/messagesExpire'
import { createClient, wait } from '../../utils'

describe('MessagesExpire', () => {
  const createTestMessage = (): IMessage => {
    return {
      type: MessageType.OPEN,
      src: 'src',
      dst: 'dst'
    }
  }

  it('should remove client if no read from queue', async () => {
    const realm = new Realm()
    const messageHandler = new MessageHandler(realm, defaultConfig)
    const checkInterval = 10
    const expireTimeout = 50
    const config = { cleanup_out_msgs: checkInterval, expire_timeout: expireTimeout }

    const messagesExpire = new MessagesExpire({ realm, config, messageHandler })

    const client = createClient()
    realm.setClient(client, 'id')
    realm.addMessageToQueue(client.getId(), createTestMessage())

    messagesExpire.startMessagesExpiration()

    await wait(checkInterval * 2)

    expect(realm.getMessageQueueById(client.getId())?.getMessages().length).toEqual(1)

    await wait(expireTimeout)

    expect(realm.getMessageQueueById(client.getId())).toBeUndefined()

    messagesExpire.stopMessagesExpiration()
  })

  it('should fire EXPIRE message', async () => {
    const realm = new Realm()
    const messageHandler = new MessageHandler(realm, defaultConfig)
    const checkInterval = 10
    const expireTimeout = 50
    const config = { cleanup_out_msgs: checkInterval, expire_timeout: expireTimeout }

    const messagesExpire = new MessagesExpire({ realm, config, messageHandler })

    const client = createClient()
    realm.setClient(client, 'id')
    realm.addMessageToQueue(client.getId(), createTestMessage())

    let handled = false

    messageHandler.handle = async (client, message): Promise<boolean> => {
      expect(client).toBeUndefined
      expect(message.type).toEqual(MessageType.EXPIRE)

      handled = true

      return true
    }

    messagesExpire.startMessagesExpiration()

    await wait(checkInterval * 2)
    await wait(expireTimeout)

    expect(handled).toBe(true)

    messagesExpire.stopMessagesExpiration()
  })
})
