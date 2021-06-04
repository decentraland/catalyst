import { Express } from 'express'
import { Server } from 'net'
import { ExpressPeerServer } from 'peerjs-server'
import { IConfig } from 'peerjs-server/dist/src/config'
import { MessageType } from 'peerjs-server/dist/src/enums'
import { ArchipelagoService } from './archipelagoService'
import { peerAuthHandler } from './auth'
import { IdService } from './idService'
import { LayersService } from './layersService'
import { PeersService } from './peersService'

export type PeerJSServerInitOptions = {
  netServer: Server
  idService: IdService
  noAuth: boolean
  peersServiceGetter: () => PeersService
  ethNetwork: string
  archipelagoServiceGetter: () => ArchipelagoService
  layersServiceGetter: () => LayersService
}

export function initPeerJsServer({
  netServer,
  idService,
  noAuth,
  peersServiceGetter,
  archipelagoServiceGetter,
  layersServiceGetter,
  ethNetwork
}: PeerJSServerInitOptions): Express {
  const options: Partial<IConfig> = {
    path: '/',
    idGenerator: () => idService.nextId(),
    authHandler: peerAuthHandler({ noAuth, peersServiceGetter, ethNetwork })
  }

  const peerServer = ExpressPeerServer(netServer, options)

  peerServer.on('disconnect', (client: any) => {
    console.log('User disconnected from server socket. Removing from all rooms & layers: ' + client.id)
    layersServiceGetter().removePeer(client.id)
    archipelagoServiceGetter().clearPeer(client.id)
  })

  peerServer.on('error', console.log)

  //@ts-ignore
  peerServer.on('message', (client: IClient, message: IMessage) => {
    if (message.type === MessageType.HEARTBEAT && client.isAuthenticated()) {
      peersServiceGetter().updateTopology(client.getId(), message.payload?.connectedPeerIds)
      peersServiceGetter().updatePeerParcel(client.getId(), message.payload?.parcel)
      peersServiceGetter().updatePeerPosition(client.getId(), message.payload?.position)
      archipelagoServiceGetter().updatePeerPosition(client.getId(), message.payload?.position)

      if (message.payload?.optimizeNetwork) {
        const optimalConnectionsResult = layersServiceGetter().getOptimalConnectionsFor(
          client.getId(),
          message.payload.targetConnections,
          message.payload.maxDistance
        )
        client.send({
          type: 'OPTIMAL_NETWORK_RESPONSE',
          src: '__lighthouse_response__',
          dst: client.getId(),
          payload: optimalConnectionsResult
        })
      }
    }
  })

  return peerServer
}
