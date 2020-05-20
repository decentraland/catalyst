import { PeerInfo, Layer, PeerRequest } from "./types";
import { RoomsService } from "./roomsService";
import { PeersService, NotificationType } from "./peersService";
import { removePeerAndNotify, getPeerId } from "./utils";
import { UserMustBeInLayerError as PeerMustBeInLayerError, LayerIsFullError, RequestError } from "./errors";
import { ConfigService } from "./configService";

type LayersServiceConfig = {
  peersService: PeersService;
  existingLayers?: string[];
  allowNewLayers?: boolean;
  layerCheckInterval?: number; //In seconds
  configService: ConfigService;
};

export class LayersService {
  private layers: Record<string, Layer> = {};

  private layerChecker: LayerChecker = new LayerChecker(this, this.peersService);

  private newLayer(layerId: string): Layer {
    return { id: layerId, peers: [], rooms: {}, lastCheckTimestamp: Date.now() };
  }

  constructor(private config: LayersServiceConfig) {
    if (this.config.existingLayers) {
      this.config.existingLayers.forEach(layerId => this.createLayer(layerId));
    }
  }

  get peersService() {
    return this.config.peersService;
  }

  getLayerIds(): string[] {
    return Object.keys(this.layers);
  }

  getLayers(): Layer[] {
    return Object.values(this.layers);
  }

  getLayer(layerId: string): Layer | undefined {
    return this.layers[layerId];
  }

  getLayerPeers(layerId: string): PeerInfo[] {
    const layer = this.layers[layerId];
    
    if (layer) {
      this.checkLayerPeersIfNeeded(layer);
      return this.peersService.getPeersInfo(layer.peers);
    } else {
      throw new RequestError("Layer not found", "layer-not-found", 404)
    }
  }

  getRoomsService(layerId: string) {
    if (!this.exists(layerId)) {
      return undefined;
    } else {
      return new RoomsService(layerId, this.layers[layerId].rooms, { ...this.config });
    }
  }

  exists(layerId: string) {
    return this.layers.hasOwnProperty(layerId);
  }

  private removePeerFromOtherLayers(layerId: string, peerId: string) {
    Object.keys(this.layers).forEach(otherLayerId => {
      if (otherLayerId !== layerId && this.isPeerInLayer(otherLayerId, peerId)) {
        this.removePeerFromLayer(otherLayerId, peerId);
      }
    });
  }

  removePeerFromLayer(layerId: string, peerId: string) {
    this.getRoomsService(layerId)?.removePeer(peerId);
    return removePeerAndNotify(this.layers, layerId, peerId, NotificationType.PEER_LEFT_LAYER, "layerId", this.peersService, !this.isDefaultLayer(layerId));
  }

  createLayer(layerId: string) {
    return (this.layers[layerId] = this.newLayer(layerId));
  }

  async setPeerLayer(layerId: string, peer: PeerRequest) {
    let layer = this.layers[layerId];

    if (!layer) {
      layer = this.createLayer(layerId);
    }

    const peerId = getPeerId(peer);

    if (!this.isPeerInLayer(layerId, peerId)) {
      const peerInfo = this.peersService.ensurePeerInfo(peer);

      this.checkLayerPeersIfNeeded(layer);

      const maxPeers = await this.getMaxPeersFor(layer)

      if (maxPeers && layer.peers.length >= maxPeers) {
        throw new LayerIsFullError(layer, peerId);
      }

      this.removePeerFromOtherLayers(layerId, peerId);

      peerInfo.layer = layerId;

      const peersToNotify = layer.peers.slice();
      layer.peers.push(peerId);
      this.peersService.notifyPeersById(peersToNotify, NotificationType.PEER_JOINED_LAYER, {
        id: peerId,
        userId: peerId,
        peerId,
        layerId: layerId
      });
    }

    return layer;
  }

  async getMaxPeersFor(layer: Layer) {
    return layer.maxPeers ?? await this.config.configService.getMaxPeersPerLayer();
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

  private isPeerInLayer(layerId: string, peerId: string) {
    return this.layers[layerId].peers.includes(peerId);
  }

  private isDefaultLayer(layerId: string) {
    return this.config.existingLayers?.includes(layerId);
  }

  async addPeerToRoom(layerId: string, roomId: string, peer: PeerRequest) {
    const peerId = getPeerId(peer);
    if (!this.isPeerInLayer(layerId, peerId)) {
      throw new PeerMustBeInLayerError(layerId, peerId);
    }

    return await this.getRoomsService(layerId)!.addPeerToRoom(roomId, peerId);
  }

  removePeer(peerId: string) {
    Object.keys(this.layers).forEach(layerId => {
      this.removePeerFromLayer(layerId, peerId);
    });
  }

  getLayerTopology(layerId: string) {
    return this.layers[layerId].peers.map(it => ({ ...this.peersService.getPeerInfo(it), connectedPeerIds: this.peersService.getConnectedPeers(it) }));
  }

  getOptimalConnectionsFor(peerId: string, targetConnections: number, maxDistance: number) {
    const peerInfo = this.peersService.getPeerInfo(peerId);
    if (peerInfo.layer && peerInfo.position) {
      return {
        layerId: peerInfo.layer,
        optimalConnections: this.peersService.getOptimalConnectionsFor(peerInfo, this.getLayerPeers(peerInfo.layer), targetConnections, maxDistance)
      };
    }
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
        layer.peers.slice().forEach(it => {
          if (this.peersService && !this.peersService.peerExistsInRealm(it)) {
            console.log(`Removing peer ${it} from layer ${layer.id} because it is not connected to Peer Network`);
            this.layersService.removePeerFromLayer(layer.id, it);
          }
        });

        this.layersBeingChecked.delete(layer.id);
      }, 0);
    }
  }
}
