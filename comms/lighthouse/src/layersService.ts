import { Peer } from "../../peer/src/Peer";
import { PeerInfo, Layer } from "./types";
import { RoomsService } from "./roomsService";
import { PeersService, NotificationType } from "./peersService";
import { removeUserAndNotify } from "./utils";
import { UserMustBeInLayerError, LayerIsFullError } from "./errors";

type LayersServiceConfig = Partial<{
  serverPeerEnabled: boolean;
  peersService: PeersService;
  existingLayers: string[];
  allowNewLayers: boolean;
  maxUsersPerLayer: number;
  layerCheckInterval: number; //In seconds
}>;

export class LayersService {
  private layers: Record<string, Layer> = {};
  private serverPeers: Record<string, Peer> = {};

  private layerChecker: LayerChecker = new LayerChecker(this, this.config.peersService);

  private newLayer(layerId: string): Layer {
    return { id: layerId, users: [], rooms: {}, maxUsers: this.config.maxUsersPerLayer, lastCheckTimestamp: Date.now() };
  }

  constructor(private config: LayersServiceConfig) {
    if (this.config.existingLayers) {
      this.config.existingLayers.forEach(layerId => this.createLayer(layerId));
    }
  }

  getLayerIds(): string[] {
    return Object.keys(this.layers);
  }

  getLayers(): Layer[] {
    return Object.values(this.layers);
  }

  getLayerUsers(layerId: string): PeerInfo[] {
    const layer = this.layers[layerId];
    if (layer) this.checkLayerPeersIfNeeded(layer);
    return layer?.users;
  }

  getRoomsService(layerId: string) {
    if (!this.exists(layerId)) {
      return undefined;
    } else {
      return new RoomsService(layerId, this.layers[layerId].rooms, { ...this.config, serverPeerProvider: () => this.getPeerForLayer(layerId) });
    }
  }

  getPeerForLayer(layerId: string): Peer | undefined {
    return this.serverPeers[layerId];
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
    return removeUserAndNotify(this.layers, layerId, userId, NotificationType.PEER_LEFT_LAYER, "layerId", this.config.peersService, !this.isDefaultLayer(layerId));
  }

  createLayer(layerId: string) {
    return (this.layers[layerId] = this.newLayer(layerId));
    // if (this.config.serverPeerEnabled) {
    //   // Clean up old peer?

    //   this.serverPeers[layerId] = await this.config.peersService?.createServerPeer(layerId)!;

    //   //await this.serverPeers[layerId].setLayer(layerId)
    // }
  }

  async setUserLayer(layerId: string, peer: PeerInfo) {
    let layer = this.layers[layerId];

    if (!layer) {
      layer = this.createLayer(layerId);
    }

    if (!this.isUserInLayer(layerId, peer)) {
      this.checkLayerPeersIfNeeded(layer);

      if (layer.maxUsers && layer.users.length >= layer.maxUsers) {
        throw new LayerIsFullError(layer, peer);
      }

      this.removeUserFromOtherLayers(layerId, peer);

      const peersToNotify = layer.users.slice();
      layer.users.push(peer);
      this.config.peersService?.notifyPeers(peersToNotify, NotificationType.PEER_JOINED_LAYER, {
        ...peer,
        layerId: layerId
      });
    }

    return layer;
  }

  checkLayerPeersIfNeeded(layer: Layer) {
    if (Date.now() - layer.lastCheckTimestamp > this.getLayerCheckInterval() * 1000) {
      layer.lastCheckTimestamp = Date.now();
      this.layerChecker.checkLayer(layer);
    }
  }

  private getLayerCheckInterval() {
    return this.config.layerCheckInterval ?? 180;
  }

  private isUserInLayer(layerId: string, peer: PeerInfo) {
    return this.layers[layerId].users.some($ => $.userId === peer.userId);
  }

  private isDefaultLayer(layerId: string) {
    return this.config.existingLayers?.includes(layerId);
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

  getLayerTopology(layerId: string) {
    return this.layers[layerId].users.map(it => ({ ...it, connectedPeerIds: this.config.peersService!.getConnectedPeers(it) }));
  }

  updateUserPosition(peerId: string, position?: [number, number]) {
    Object.values(this.layers).forEach(layer => {
      const user = layer.users.find(it => it.peerId === peerId);
      if (user) {
        user.position = position;
      }
    });
  }
}

class LayerChecker {
  private layersBeingChecked: Set<string> = new Set();

  constructor(private layersService: LayersService, private peersService?: PeersService) {}

  checkLayer(layer: Layer) {
    if (!this.layersBeingChecked.has(layer.id)) {
      this.layersBeingChecked.add(layer.id);

      //We execute the check as a background task to avoid impacting a request, even though this should be pretty quick
      setTimeout(() => {
        layer.users.slice().forEach(it => {
          if (this.peersService && !this.peersService.peerExistsInRealm(it)) {
            console.log(`Removing user ${it.userId} from layer ${layer.id} because it is not connected to Peer Network`);
            this.layersService.removeUserFromLayer(layer.id, it.userId);
          }
        });

        this.layersBeingChecked.delete(layer.id);
      }, 0);
    }
  }
}
