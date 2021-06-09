import { PeerRequest } from '../types'

export function getPeerId(peer: PeerRequest): string {
  return (peer.id ?? peer.peerId)!
}
