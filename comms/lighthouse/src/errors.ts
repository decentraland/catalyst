import { PeerInfo, Layer } from "./types";

export class RequestError extends Error {
  constructor(message: string, public statusMessage?: string, public status: number = 400) {
    super(message);
  }
}

export class UserMustBeInLayerError extends RequestError {
  constructor(layerId: string, peer: PeerInfo) {
    super(`User '${peer.userId}' must be in layer '${layerId}' to perform operation`, 'user_not_in_layer');
  }
}

export class LayerIsFullError extends RequestError {
  constructor(layer: Layer, peer: PeerInfo) {
    super(`User '${peer.userId}' cannot join layer '${layer.id}' because it is full (max: ${layer.maxUsers})`, 'layer_is_full');
  }
}
