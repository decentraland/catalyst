export type PeerInfo = {
  userId: string;
  peerId: string;
  protocolVersion?: number;
  position?: [number, number];
};

export type Room = {
  id: string;
  users: PeerInfo[];
};

export type Layer = {
  id: string;
  users: PeerInfo[];
  rooms: Record<string, Room>;
  maxUsers?: number;
  lastCheckTimestamp: number;
};
