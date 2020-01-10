export type Room = { id: string; users: Map<string, PeerConnectionData> };
export type PeerConnectionData = { userId: string; peerId: string };

export interface IPeer {
  nickname: string;
  currentRooms: Room[];
  callback: (sender: string, room: string, payload: any) => void;
  setLayer(layer: string): Promise<void>;
  joinRoom(room: string): Promise<void>;
  leaveRoom(roomId: string): Promise<void>;
  sendMessage(room: string, payload: any, reliable?: boolean): Promise<void>;
}
