import { MessageType } from '../../../src/peerjs-server/enums'
import { Handler } from '../../../src/peerjs-server/messageHandler/handler'
import { HandlersRegistry } from '../../../src/peerjs-server/messageHandler/handlersRegistry'

describe('HandlersRegistry', () => {
  it('should execute handler for message type', () => {
    const handlersRegistry = new HandlersRegistry()

    let handled = false

    const handler: Handler = async (): Promise<boolean> => {
      handled = true
      return true
    }

    handlersRegistry.registerHandler(MessageType.OPEN, handler)

    handlersRegistry.handle(undefined, { type: MessageType.OPEN, src: 'src', dst: 'dst' }).catch(console.error)

    expect(handled).toBe(true)
  })
})
