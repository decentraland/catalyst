import { PeerMessageType } from "./messageTypes";
import { Position } from "../../../commons/utils/Positions";
import { SocketBuilder } from "./peerjs-server-connector/socket";

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
  latency?: number;
  hops?: number;
};
export type MinPeerData = { id: string; rooms?: string[] };

export interface IPeer {
  peerId?: string;
  peerIdOrFail(): string;
  currentRooms: Room[];
  logLevel: LogLevelString;
  callback: (sender: string, room: string, payload: any) => void;
  setLayer(layer: string): Promise<void>;
  joinRoom(room: string): Promise<void>;
  leaveRoom(roomId: string): Promise<void>;
  sendMessage(room: string, payload: any, type?: PeerMessageType): Promise<void>;
  dispose(): Promise<void>;
  awaitConnectionEstablished(timeout?: number): Promise<void>;
  setPeerPosition(peerId: string, position: Position): void;
  isConnectedTo(peerId: string): boolean;
}

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  NONE = Number.MAX_SAFE_INTEGER
}

export type LogLevelString = keyof typeof LogLevel;

export type PingResult = {
  peerId: string;
  latency: number;
};

export type PeerConfig = {
  connectionConfig?: any;
  wrtc?: any;
  socketBuilder?: SocketBuilder;
  token?: string;
  sessionId?: string;
  targetConnections?: number;
  maxConnections?: number;
  peerConnectTimeout?: number;
  oldConnectionsTimeout?: number;
  messageExpirationTime?: number;
  logLevel?: keyof typeof LogLevel;
  reconnectionAttempts?: number;
  backoffMs?: number;
  optimizeNetworkInterval?: number;
  authHandler?: (msg: string) => Promise<string>;
  positionConfig?: PositionConfig;
  statusHandler?: (status: string) => void;
  statsUpdateInterval?: number; 
  /**
   * If not set, the peer won't execute pings regularly.
   * Keep in mind that the peer won't execute two pings at the same time.
   * Effective interval is actually pingInterval + pingTimeout
   */
  pingInterval?: number;
  pingTimeout?: number;
};

export type PositionConfig = {
  selfPosition: () => Position | undefined;
  distance?: (l1: Position, l2: Position) => number;
  nearbyPeersDistance?: number;
};

export type PacketCallback = (sender: string, room: string, payload: any) => void;