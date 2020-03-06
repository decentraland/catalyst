import { Position } from "decentraland-katalyst-utils/Positions";

export type PeerInfo = {
  id: string;
  protocolVersion?: number;
  parcel?: [number, number];
  position?: Position;
  layer?: string;
};

export type PeerRequest = {
  id?: string;
  userId?: string;
  protocolVersion?: number;
  peerId?: string;
};

export type Room = {
  id: string;
  users: string[];
};

export type Layer = {
  id: string;
  users: string[];
  rooms: Record<string, Room>;
  maxUsers?: number;
  lastCheckTimestamp: number;
};