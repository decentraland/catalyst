import { Peer } from "../../peer/src/Peer";
import { PeerInfo, Layer } from "./types";
import { RoomsService } from "./roomsService";
import { PeersService, NotificationType } from "./peersService";
import { removeUserAndNotify } from "./utils";
import { UserMustBeInLayerError } from "./errors";

type LayersServiceConfig = Partial<{
  serverPeerEnabled: boolean;
  serverPeerProvider: () => Peer | undefined;
  peersService: PeersService;
}>;

function newLayer(layerId: string) {
  return { id: layerId, users: [], rooms: {} };
}

//TODO - pablitar: There are some similarities between this service and the RoomsService.ts one.
//But I think it is too soon to extract a common abstraction, since they seem to be different entities
//from the product side. In the future with more information this could be refactored
export class LayersService {
  private layers: Record<string, Layer> = {};
  constructor(private config: LayersServiceConfig) {}

  getLayerIds(): string[] {
    return Object.keys(this.layers);
  }

  getLayerUsers(layerId: string): PeerInfo[] {
    return this.layers[layerId]?.users;
  }

  getRoomsService(layerId: string) {
    if (!this.exists(layerId)) {
      return undefined;
    } else {
      return new RoomsService(layerId, this.layers[layerId].rooms, this.config);
    }
  }

  exists(layerId: string) {
    return this.layers.hasOwnProperty(layerId);
  }

  private removeUserFromOtherLayers(layerId: string, peer: PeerInfo) {
    Object.keys(this.layers).forEach(otherLayerId => {
      if (otherLayerId !== layerId && this.isUserInLayer(otherLayerId, peer)) {
        this.removeUserFromLayer(otherLayerId, peer.userId);
      }
    });
  }

  removeUserFromLayer(layerId: string, userId: string) {
    this.getRoomsService(layerId)?.removeUser(userId);
    return removeUserAndNotify(this.layers, layerId, userId, NotificationType.PEER_LEFT_LAYER);
  }

  async setUserLayer(layerId: string, peer: PeerInfo) {
    this.removeUserFromOtherLayers(layerId, peer);
    let layer = this.layers[layerId];

    if (!layer) {
      this.layers[layerId] = layer = newLayer(layerId);

      // TODO: Add serverPeer to layer and maybe refactor like removeUserFromLayer
      // const serverPeer = getServerPeer(this.config.serverPeerProvider)
      // if (this.config.serverPeerEnabled && this.config) {
      //   await serverPeer.joinRoom(roomId);
      // }
    }

    if (!this.isUserInLayer(layerId, peer)) {
      layer.users.push(peer);
    }

    return layer;
  }

  private isUserInLayer(layerId: string, peer: PeerInfo) {
    return this.layers[layerId].users.some($ => $.userId === peer.userId);
  }

  async addUserToRoom(layerId: string, roomId: string, peer: PeerInfo) {
    if (!this.isUserInLayer(layerId, peer)) {
      throw new UserMustBeInLayerError(layerId, peer);
    }

    return await this.getRoomsService(layerId)!.addUserToRoom(roomId, peer);
  }

  removeUser(userId: string) {
    Object.keys(this.layers).forEach(layerId => {
      this.removeUserFromLayer(layerId, userId);
    });
  }
}
