import { PeerMessageType } from "./messageTypes";

type PacketSubtypeData = {
  lastTimestamp: number;
  lastSequenceId: number;
};

export type Position3D = [number, number, number]

export type Room = { id: string; users: string[] };
export type KnownPeerData<PositionType = Position3D> = {
  id: string;
  rooms: string[];
  timestamp?: number;
  subtypeData: Record<string, PacketSubtypeData>;
  position?: PositionType;
};
export type MinPeerData = { id: string, rooms?: string[] };

export interface IPeer<PositionType = Position3D> {
  peerId: string;
  currentRooms: Room[];
  callback: (sender: string, room: string, payload: any) => void;
  setLayer(layer: string): Promise<void>;
  joinRoom(room: string): Promise<void>;
  leaveRoom(roomId: string): Promise<void>;
  sendMessage(room: string, payload: any, type?: PeerMessageType): Promise<void>;
  dispose(): Promise<void>;
  awaitConnectionEstablished(timeout?: number): Promise<void>;
}
