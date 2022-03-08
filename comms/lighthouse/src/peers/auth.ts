import { httpProviderForNetwork } from '@dcl/catalyst-contracts'
import { Authenticator } from 'dcl-crypto'
import { IdType, MessageType } from '../peerjs-server/enums'
import { IClient } from '../peerjs-server/models/client'
import { IMessage } from '../peerjs-server/models/message'
import { PeersService } from '../peers/peersService'

export type AuthHandlerConfiguration = {
  noAuth: boolean
  peersServiceGetter: () => PeersService
  ethNetwork: string
}

export function peerAuthHandler({
  noAuth,
  peersServiceGetter,
  ethNetwork
}: AuthHandlerConfiguration): (client: IClient | undefined, message: IMessage) => Promise<boolean> {
  return async (client, message) => {
    if (noAuth) {
      return true
    }

    if (!client) {
      // client not registered
      return false
    }
    if (
      client.getIdType() === IdType.SELF_ASSIGNED &&
      client.getId().toLowerCase() !== message.payload[0]?.payload?.toLowerCase()
    ) {
      // client id mistmaches with auth signer
      return false
    }
    try {
      const provider = httpProviderForNetwork(ethNetwork)
      const result = await Authenticator.validateSignature(client.getMsg(), message.payload, provider)

      const address = message.payload[0].payload

      if (!peersServiceGetter().existsPeerWithAddress(address)) {
        peersServiceGetter().setPeerAddress(client.getId(), message.payload[0].payload)
      } else {
        client.send({
          type: MessageType.ID_TAKEN,
          payload: { msg: 'ETH Address is taken' }
        })

        client.getSocket()?.close()
        return false
      }

      return result.ok
    } catch (e) {
      console.log(`error while recovering address for client ${client.getId()}`, e)
      return false
    }
  }
}
