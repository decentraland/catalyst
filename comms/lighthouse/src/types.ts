import { Position3D } from '@dcl/catalyst-node-commons'
import { ConfigService } from './config/configService'
import { ArchipelagoService } from './peers/archipelagoService'
import { IdService } from './peers/idService'
import { PeersService } from './peers/peersService'

export type PeerInfo = {
  id: string
  address?: string
  protocolVersion?: number
  parcel?: [number, number]
  position?: Position3D
  layer?: string
  lastPing?: number
}

export type PeerRequest = {
  id?: string
  userId?: string
  protocolVersion?: number
  peerId?: string
}

export type Room = {
  id: string
  peers: string[]
}

export type Layer = {
  id: string
  peers: string[]
  rooms: Record<string, Room>
  maxPeers?: number
  lastCheckTimestamp: number
}

export type AppServices = {
  idService: IdService
  configService: ConfigService
  peersService: () => PeersService
  archipelagoService: () => ArchipelagoService
}

export interface RTCIceServer {
  credential?: string
  credentialType?: RTCIceCredentialType
  urls: string | string[]
  username?: string
}

export type PeerParameters = Partial<{
  iceServers: RTCIceServer[]
}>

export type PeerTopologyInfo = { id: string; connectedPeers: string[] }
