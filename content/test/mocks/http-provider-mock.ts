import { Callback, HTTPProvider, RPCMessage } from 'eth-connect'

export function createHttpProviderMock(messages: any[] = []): HTTPProvider {
  let i = 0
  return {
    host: '',
    options: {},
    debug: false,
    send: () => {},
    sendAsync: async (_payload: RPCMessage | RPCMessage[], _callback: Callback): Promise<void> => {
      if (i >= messages.length) {
        throw new Error('No more messages mocked to send')
      }
      _callback(null, messages[i++] || {})
    }
  }
}
