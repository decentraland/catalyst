// package: 
// file: comms/peer/proto/peer.proto

import * as jspb from "google-protobuf";

export class MessageData extends jspb.Message {
  getRoom(): string;
  setRoom(value: string): void;

  clearDstList(): void;
  getDstList(): Array<Uint8Array | string>;
  getDstList_asU8(): Array<Uint8Array>;
  getDstList_asB64(): Array<string>;
  setDstList(value: Array<Uint8Array | string>): void;
  addDst(value: Uint8Array | string, index?: number): Uint8Array | string;

  getPayload(): Uint8Array | string;
  getPayload_asU8(): Uint8Array;
  getPayload_asB64(): string;
  setPayload(value: Uint8Array | string): void;

  getEncoding(): PayloadEncodingMap[keyof PayloadEncodingMap];
  setEncoding(value: PayloadEncodingMap[keyof PayloadEncodingMap]): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): MessageData.AsObject;
  static toObject(includeInstance: boolean, msg: MessageData): MessageData.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: MessageData, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): MessageData;
  static deserializeBinaryFromReader(message: MessageData, reader: jspb.BinaryReader): MessageData;
}

export namespace MessageData {
  export type AsObject = {
    room: string,
    dstList: Array<Uint8Array | string>,
    payload: Uint8Array | string,
    encoding: PayloadEncodingMap[keyof PayloadEncodingMap],
  }
}

export class PingData extends jspb.Message {
  getPingid(): number;
  setPingid(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PingData.AsObject;
  static toObject(includeInstance: boolean, msg: PingData): PingData.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: PingData, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PingData;
  static deserializeBinaryFromReader(message: PingData, reader: jspb.BinaryReader): PingData;
}

export namespace PingData {
  export type AsObject = {
    pingid: number,
  }
}

export class PongData extends jspb.Message {
  getPingid(): number;
  setPingid(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PongData.AsObject;
  static toObject(includeInstance: boolean, msg: PongData): PongData.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: PongData, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PongData;
  static deserializeBinaryFromReader(message: PongData, reader: jspb.BinaryReader): PongData;
}

export namespace PongData {
  export type AsObject = {
    pingid: number,
  }
}

export class Packet extends jspb.Message {
  getSequenceid(): number;
  setSequenceid(value: number): void;

  getInstanceid(): number;
  setInstanceid(value: number): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSrc(): string;
  setSrc(value: string): void;

  getSubtype(): string;
  setSubtype(value: string): void;

  getDiscardolderthan(): number;
  setDiscardolderthan(value: number): void;

  getOptimistic(): boolean;
  setOptimistic(value: boolean): void;

  getExpiretime(): number;
  setExpiretime(value: number): void;

  getHops(): number;
  setHops(value: number): void;

  getTtl(): number;
  setTtl(value: number): void;

  clearReceivedbyList(): void;
  getReceivedbyList(): Array<string>;
  setReceivedbyList(value: Array<string>): void;
  addReceivedby(value: string, index?: number): string;

  hasMessagedata(): boolean;
  clearMessagedata(): void;
  getMessagedata(): MessageData | undefined;
  setMessagedata(value?: MessageData): void;

  hasPingdata(): boolean;
  clearPingdata(): void;
  getPingdata(): PingData | undefined;
  setPingdata(value?: PingData): void;

  hasPongdata(): boolean;
  clearPongdata(): void;
  getPongdata(): PongData | undefined;
  setPongdata(value?: PongData): void;

  getDataCase(): Packet.DataCase;
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Packet.AsObject;
  static toObject(includeInstance: boolean, msg: Packet): Packet.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Packet, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Packet;
  static deserializeBinaryFromReader(message: Packet, reader: jspb.BinaryReader): Packet;
}

export namespace Packet {
  export type AsObject = {
    sequenceid: number,
    instanceid: number,
    timestamp: number,
    src: string,
    subtype: string,
    discardolderthan: number,
    optimistic: boolean,
    expiretime: number,
    hops: number,
    ttl: number,
    receivedbyList: Array<string>,
    messagedata?: MessageData.AsObject,
    pingdata?: PingData.AsObject,
    pongdata?: PongData.AsObject,
  }

  export enum DataCase {
    DATA_NOT_SET = 0,
    MESSAGEDATA = 11,
    PINGDATA = 12,
    PONGDATA = 13,
  }
}

export interface PacketTypeMap {
  UKNOWN_PACKET_TYPE: 0;
  MESSAGE: 1;
  PING: 2;
  PONG: 3;
}

export const PacketType: PacketTypeMap;

export interface PayloadEncodingMap {
  BYTES: 0;
  STRING: 1;
  JSON: 2;
}

export const PayloadEncoding: PayloadEncodingMap;

