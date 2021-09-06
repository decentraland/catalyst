import { Express } from 'express'
import { Server } from 'net'
import { LighthouseConfig } from '../config/configService'
import { ExpressPeerServer } from '../peerjs-server'
import { IConfig } from '../peerjs-server/config'
import { AppServices } from '../types'
import { peerAuthHandler } from './auth'
import { PeerMessagesHandler } from './peerMessagesHandler'

export type PeerJSServerInitOptions = {
  netServer: Server
  noAuth: boolean
  ethNetwork: string
  messagesHandler: PeerMessagesHandler
} & AppServices

export function initPeerJsServer({
  netServer,
  idService,
  noAuth,
  peersService,
  archipelagoService,
  messagesHandler,
  configService,
  ethNetwork
}: PeerJSServerInitOptions): Express {
  const options: Partial<IConfig> = {
    path: '/',
    idGenerator: () => idService.nextId(),
    authHandler: peerAuthHandler({ noAuth, peersServiceGetter: peersService, ethNetwork }),
    concurrent_limit: configService.get(LighthouseConfig.MAX_CONCURRENT_USERS),
    transmissionFilter: (src, dst) => archipelagoService().areInSameIsland(src, dst)
  }

  const peerServer = ExpressPeerServer(netServer, options)

  peerServer.on('disconnect', (client: any) => {
    console.log('User disconnected from server socket. Removing from archipelago: ' + client.id)
    archipelagoService().clearPeer(client.id)
    peersService().clearPeer(client.id)
  })

  peerServer.on('error', console.log)

  peerServer.on('message', messagesHandler as any)

  return peerServer
}
