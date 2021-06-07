import { Layer } from '../types'

export class RequestError extends Error {
  constructor(message: string, public statusMessage?: string, public status: number = 400) {
    super(message)
  }
}

export class UserMustBeInLayerError extends RequestError {
  constructor(layerId: string, peerId: string) {
    super(`User '${peerId}' must be in layer '${layerId}' to perform operation`, 'user_not_in_layer')
  }
}

export class LayerIsFullError extends RequestError {
  constructor(layer: Layer, peerId: string) {
    super(
      `User '${peerId}' cannot join layer '${layer.id}' because it is full (max: ${layer.maxPeers})`,
      'layer_is_full'
    )
  }
}
