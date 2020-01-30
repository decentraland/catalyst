import { PeerMessageType } from "./messageTypes";

type PacketSubtypeData = {
  lastTimestamp: number;
  lastSequenceId: number;
};

export type Room = { id: string; users: string[] };
export type KnownPeerData = { userId: string; peerId: string; rooms: string[]; timestamp?: number; subtypeData: Record<string, PacketSubtypeData> };
export type MinPeerData = { userId: string; peerId: string; rooms?: string[] };

export interface IPeer {
  peerId: string;
  currentRooms: Room[];
  callback: (sender: string, room: string, payload: any) => void;
  setLayer(layer: string): Promise<void>;
  joinRoom(room: string): Promise<void>;
  leaveRoom(roomId: string): Promise<void>;
  sendMessage(room: string, payload: any, type?: PeerMessageType): Promise<void>;
  dispose(): Promise<void>;
}
