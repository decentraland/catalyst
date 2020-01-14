export type Room = { id: string; users: string[] };
export type KnownPeerData = { userId: string; peerId: string, rooms: string[], timestamp?: number };
export type PeerIdentity = { userId: string; peerId: string, rooms?: string[] }

export interface IPeer {
  nickname: string;
  currentRooms: Room[];
  callback: (sender: string, room: string, payload: any) => void;
  setLayer(layer: string): Promise<void>;
  joinRoom(room: string): Promise<void>;
  leaveRoom(roomId: string): Promise<void>;
  sendMessage(room: string, payload: any, reliable?: boolean): Promise<void>;
}