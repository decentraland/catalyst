import { IConfig } from '../../config'
import { MessageType } from '../../enums'
import { IMessageHandler } from '../../messageHandler'
import { IRealm } from '../../models/realm'

export interface IMessagesExpire {
  startMessagesExpiration(): void
  stopMessagesExpiration(): void
}

type CustomConfig = Pick<IConfig, 'cleanup_out_msgs' | 'expire_timeout'>

export class MessagesExpire implements IMessagesExpire {
  private readonly realm: IRealm
  private readonly config: CustomConfig
  private readonly messageHandler: IMessageHandler

  private timeoutId: NodeJS.Timeout | null = null

  constructor({
    realm,
    config,
    messageHandler
  }: {
    realm: IRealm
    config: CustomConfig
    messageHandler: IMessageHandler
  }) {
    this.realm = realm
    this.config = config
    this.messageHandler = messageHandler
  }

  public startMessagesExpiration(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
    }

    // Clean up outstanding messages
    this.timeoutId = setTimeout(async () => {
      try {
        await this.pruneOutstanding()
      } catch (e) {
        console.error('Error while prunning expired messages', e)
      }

      this.timeoutId = null

      this.startMessagesExpiration()
    }, this.config.cleanup_out_msgs)
  }

  public stopMessagesExpiration(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  private async pruneOutstanding() {
    const destinationClientsIds = this.realm.getClientsIdsWithQueue()

    const now = new Date().getTime()
    const maxDiff = this.config.expire_timeout

    const seen: Record<string, boolean> = {}

    for (const destinationClientId of destinationClientsIds) {
      const messageQueue = this.realm.getMessageQueueById(destinationClientId)!
      const lastReadDiff = now - messageQueue.getLastReadAt()

      if (lastReadDiff < maxDiff) continue

      const messages = messageQueue.getMessages()

      for (const message of messages) {
        if (!seen[message.src]) {
          await this.messageHandler.handle(undefined, {
            type: MessageType.EXPIRE,
            src: message.dst,
            dst: message.src
          })

          seen[message.src] = true
        }
      }

      this.realm.clearMessageQueue(destinationClientId)
    }
  }
}
