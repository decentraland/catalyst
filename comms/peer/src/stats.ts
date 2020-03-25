import { Packet } from "./proto/peer_protobuf";

export class Stats {
  public expired: number = 0;
  public expiredPercentage: number = 0;
  public packetDuplicates: number = 0;
  public duplicatePercentage: number = 0;
  public averagePacketSize?: number = undefined;
  public optimistic: number = 0;
  public packets: number = 0;
  public totalBytes: number = 0;

  countPacket(packet: Packet, length: number, duplicate: boolean = false, expired: boolean = false) {
    this.packets += 1;
    if (duplicate) this.packetDuplicates += 1;

    this.totalBytes += length;

    this.averagePacketSize = this.totalBytes / this.packets;
    this.duplicatePercentage = this.packetDuplicates / this.packets;
    if (packet.optimistic) this.optimistic += 1;
    if (expired) this.expired += 1;
    this.expiredPercentage = this.expired / this.packets;
  }
}

export class GlobalStats extends Stats {
  public statsByType: Record<string, Stats> = {};

  countPacket(packet: Packet, length: number, duplicate: boolean = false, expired: boolean = false) {
    super.countPacket(packet, length, duplicate, expired);
    if (packet.subtype) {
      const stats = (this.statsByType[packet.subtype] = this.statsByType[packet.subtype] ?? new Stats());
      stats.countPacket(packet, length, duplicate, expired);
    }
  }
}