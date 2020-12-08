import { NotificationType, IPeersService } from './peersService'
import { PeerRequest } from './types'

type PeerContainer = {
  peers: string[]
}

//This function seems to signal the need for an abstraction, but it may be added later in a refactor
export function removePeerAndNotify<T extends PeerContainer>(
  containers: Record<string, T>,
  containerId: string,
  peerId: string,
  notificationType: NotificationType,
  containerKey: string,
  peersService?: IPeersService,
  deleteIfEmpty: boolean = true
): T {
  const container = containers[containerId]
  if (container) {
    const index = container.peers.indexOf(peerId)
    if (index !== -1) {
      container.peers.splice(index, 1)

      peersService?.notifyPeersById(container.peers, notificationType, {
        id: peerId,
        userId: peerId,
        peerId,
        [containerKey]: containerId
      })
    }

    if (container.peers.length === 0 && deleteIfEmpty) {
      delete containers[containerId]
    }
  }

  return container
}

export function getPeerId(peer: PeerRequest): string {
  return (peer.id ?? peer.peerId)!
}
