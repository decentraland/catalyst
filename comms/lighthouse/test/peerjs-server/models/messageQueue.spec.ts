import { MessageType } from '../../../src/peerjs-server/enums'
import { IMessage } from '../../../src/peerjs-server/models/message'
import { MessageQueue } from '../../../src/peerjs-server/models/messageQueue'
import { wait } from '../utils'

describe('MessageQueue', () => {
  const createTestMessage = (): IMessage => {
    return {
      type: MessageType.OPEN,
      src: 'src',
      dst: 'dst'
    }
  }

  describe('#addMessage', () => {
    it('should add message to queue', () => {
      const queue = new MessageQueue()
      queue.addMessage(createTestMessage())
      expect(queue.getMessages().length).toEqual(1)
    })
  })

  describe('#readMessage', () => {
    it('should return undefined for empty queue', () => {
      const queue = new MessageQueue()
      expect(queue.readMessage()).toBeUndefined()
    })

    it('should return message if any exists in queue', () => {
      const queue = new MessageQueue()
      const message = createTestMessage()
      queue.addMessage(message)

      expect(queue.readMessage()).toEqual(message)
      expect(queue.readMessage()).toBeUndefined()
    })
  })

  describe('#getLastReadAt', () => {
    it('should not be changed if no messages when read', () => {
      const queue = new MessageQueue()
      const lastReadAt = queue.getLastReadAt()
      queue.readMessage()
      expect(queue.getLastReadAt()).toEqual(lastReadAt)
    })

    it('should be changed when read message', async () => {
      const queue = new MessageQueue()
      const lastReadAt = queue.getLastReadAt()
      queue.addMessage(createTestMessage())

      await wait(15)

      expect(queue.getLastReadAt()).toEqual(lastReadAt)

      queue.readMessage()

      // setTimeout is not as precise as one would like, so we cannot test exact milliseconds here.
      // We assume it should be greater than at least the previous + 5
      expect(queue.getLastReadAt()).toBeGreaterThanOrEqual(lastReadAt + 5)
    })
  })
})
