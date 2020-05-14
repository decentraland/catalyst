import { Position } from "decentraland-katalyst-utils/Positions";

export type PeerInfo = {
  id: string;
  address?: string;
  protocolVersion?: number;
  parcel?: [number, number];
  position?: Position;
  layer?: string;
  lastPing?: number;
};

export type PeerRequest = {
  id?: string;
  userId?: string;
  protocolVersion?: number;
  peerId?: string;
};

export type Room = {
  id: string;
  peers: string[];
};

export type Layer = {
  id: string;
  peers: string[];
  rooms: Record<string, Room>;
  maxPeers?: number;
  lastCheckTimestamp: number;
};