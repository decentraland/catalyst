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