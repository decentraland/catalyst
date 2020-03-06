import { PeerMessageType } from "./messageTypes";
import { Position } from "decentraland-katalyst-utils/Positions";

type PacketSubtypeData = {
  lastTimestamp: number;
  lastSequenceId: number;
};

export type Room = { id: string; users: string[] };
export type KnownPeerData = {
  id: string;
  rooms: string[];
  timestamp?: number;
  subtypeData: Record<string, PacketSubtypeData>;
  position?: Position;
};
export type MinPeerData = { id: string; rooms?: string[] };

export interface IPeer {
  peerId: string;
  currentRooms: Room[];
  callback: (sender: string, room: string, payload: any) => void;
  setLayer(layer: string): Promise<void>;
  joinRoom(room: string): Promise<void>;
  leaveRoom(roomId: string): Promise<void>;
  sendMessage(room: string, payload: any, type?: PeerMessageType): Promise<void>;
  dispose(): Promise<void>;
  awaitConnectionEstablished(timeout?: number): Promise<void>;
  setPeerPosition(peerId: string, position: Position): void;
}