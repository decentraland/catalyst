import { Peer } from "../../peer/src/Peer";
import { PeerInfo } from "./types";
import { NotificationType, IPeersService } from "./peersService";

export function getServerPeer(peerProvider?: () => Peer | undefined) {
  return peerProvider ? peerProvider() : undefined;
}

type UserContainer = {
  users: PeerInfo[];
};

//This function seems to signal the need for an abstraction, but it may be added later in a refactor
export function removeUserAndNotify<T extends UserContainer>(
  containers: Record<string, T>,
  containerId: string,
  userId: string,
  notificationType: NotificationType,
  containerKey: string,
  peersService?: IPeersService,
  deleteIfEmpty: boolean = true
): T {
  let container = containers[containerId];
  if (container) {
    const index = container.users.findIndex($ => $.userId === userId);
    if (index !== -1) {
      const [peerData] = container.users.splice(index, 1);

      peersService?.notifyPeers(container.users, notificationType, {
        userId: peerData.userId,
        peerId: peerData.peerId,
        [containerKey]: containerId
      });
    }

    if (container.users.length === 0 && deleteIfEmpty) {
      delete containers[containerId];
    }
  }

  return container;
}
