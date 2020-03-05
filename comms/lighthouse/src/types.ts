export type Position3D = [number, number, number];
export type Position2D = [number, number];

export function isPosition3D(position: any): position is Position3D {
  return position instanceof Array && position.length === 3;
}

export function isPosition2D(position: any): position is Position2D {
  return position instanceof Array && position.length === 2;
}

export type PeerInfo<PositionType> = {
  id: string;
  protocolVersion?: number;
  parcel?: [number, number];
  position?: PositionType;
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

export type PeerConnectionHint = {
  id: string;
  distance: number;
  // Maybe add position here?
}