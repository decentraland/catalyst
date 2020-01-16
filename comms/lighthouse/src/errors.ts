import { PeerInfo } from "./types";

export class UserMustBeInLayerError extends Error {
  constructor(layerId: string, peer: PeerInfo) {
    super(`User '${peer.userId}' must be in layer '${layerId}' to perform operation`);
  }
}
