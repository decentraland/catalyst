import { Packet } from "./proto/peer_protobuf";
import { Peer } from "./Peer";
import { average } from "decentraland-katalyst-utils/util";

type PeriodicValue = {
  accumulatedInPeriod: number;
  currentValue?: number;
  lastAccumulatedValue?: number;
};

function newPeriodicValue() {
  return { accumulatedInPeriod: 0 };
}

export class Stats {
  public expired: number = 0;
  public expiredPercentage: number = 0;
  public packetDuplicates: number = 0;
  public duplicatePercentage: number = 0;
  public averagePacketSize?: number = undefined;
  public optimistic: number = 0;
  public packets: number = 0;
  public totalBytes: number = 0;

  public lastPeriodUpdate: number = 0;

  // Periodic stats. Each of these need to accumulate during a period to calculate their values
  public _bytesPerSecond: PeriodicValue = newPeriodicValue();
  public _packetsPerSecond: PeriodicValue = newPeriodicValue();
  public _expiredPerSecond: PeriodicValue = newPeriodicValue();
  public _duplicatesPerSecond: PeriodicValue = newPeriodicValue();

  public get bytesPerSecond() {
    return this._bytesPerSecond.currentValue;
  }

  public get expiredPerSecond() {
    return this._expiredPerSecond.currentValue;
  }

  public get packetsPerSecond() {
    return this._packetsPerSecond.currentValue;
  }

  public get duplicatesPerSecond() {
    return this._duplicatesPerSecond.currentValue;
  }

  countPacket(packet: Packet, length: number, duplicate: boolean = false, expired: boolean = false) {
    this.packets += 1;

    this._packetsPerSecond.accumulatedInPeriod += 1;

    if (duplicate) {
      this.packetDuplicates += 1;
      this._duplicatesPerSecond.accumulatedInPeriod += 1;
    }

    this.totalBytes += length;
    this._bytesPerSecond.accumulatedInPeriod += length;

    this.averagePacketSize = this.totalBytes / this.packets;
    this.duplicatePercentage = this.packetDuplicates / this.packets;
    if (packet.optimistic) this.optimistic += 1;
    if (expired) {
      this.expired += 1;
      this._expiredPerSecond.accumulatedInPeriod += 1;
    }
    this.expiredPercentage = this.expired / this.packets;
  }

  onPeriod(timestamp: number) {
    const elapsed = this.lastPeriodUpdate ? timestamp - this.lastPeriodUpdate : 0;
    const calculateAndReset = (value: PeriodicValue) => {
      if (elapsed) {
        value.currentValue = (value.accumulatedInPeriod * 1000) / elapsed;
      }
      value.lastAccumulatedValue = value.lastAccumulatedValue;
      value.accumulatedInPeriod = 0;
    };

    calculateAndReset(this._bytesPerSecond);
    calculateAndReset(this._packetsPerSecond);
    calculateAndReset(this._expiredPerSecond);
    calculateAndReset(this._duplicatesPerSecond);

    this.lastPeriodUpdate = timestamp;
  }
}

export class TypedStats extends Stats {
  public statsByType: Record<string, Stats> = {};

  countPacket(packet: Packet, length: number, duplicate: boolean = false, expired: boolean = false) {
    super.countPacket(packet, length, duplicate, expired);
    if (packet.subtype) {
      const stats = (this.statsByType[packet.subtype] = this.statsByType[packet.subtype] ?? new Stats());
      stats.countPacket(packet, length, duplicate, expired);
    }
  }

  onPeriod(timestamp: number) {
    super.onPeriod(timestamp);
    Object.values(this.statsByType).forEach((it) => it.onPeriod(timestamp));
  }
}

type PacketOperationType = "sent" | "received" | "relayed";

export class GlobalStats {
  public sent: TypedStats = new TypedStats();
  public received: TypedStats = new TypedStats();
  public relayed: TypedStats = new TypedStats();
  public all: TypedStats = new TypedStats();

  private periodId?: number;

  public onPeriodicStatsUpdated: (stats: GlobalStats) => void = (_) => {};

  constructor(public periodLength: number = 1000) {}

  countPacket(packet: Packet, length: number, duplicate: boolean = false, expired: boolean = false, operation: PacketOperationType) {
    this.all.countPacket(packet, length, duplicate, expired);
    this[operation].countPacket(packet, length, duplicate, expired);
  }

  onPeriod(timestamp: number) {
    this.all.onPeriod(timestamp);
    this.sent.onPeriod(timestamp);
    this.received.onPeriod(timestamp);
    this.relayed.onPeriod(timestamp);
  }

  startPeriod() {
    const periodFunction = () => {
      this.onPeriod(performance.now());
      this.onPeriodicStatsUpdated(this);
      this.periodId = setTimeout(periodFunction, this.periodLength) as any;
    };

    periodFunction();
  }

  dispose() {
    clearTimeout(this.periodId);
  }
}

/**
 * Helper function to build a data objet to submit the stats for analytics
 */

export function buildCatalystPeerStatsData(catalystPeer: Peer) {
  const stats = catalystPeer.stats;

  function buildStatsFor(statsKey: string) {
    const result: Record<string, any> = {};
    result[statsKey] = stats[statsKey].packets;
    result[`${statsKey}PerSecond`] = stats[statsKey].packetsPerSecond;
    result[`${statsKey}Bytes`] = stats[statsKey].totalBytes;
    result[`${statsKey}BytesPerSecond`] = stats[statsKey].bytesPerSecond;
    result[`${statsKey}AveragePacketSize`] = stats[statsKey].averagePacketSize;
    return result;
  }
  const statsToSubmit = {
    ...buildStatsFor("sent"),
    ...buildStatsFor("received"),
    ...buildStatsFor("relayed"),
    ...buildStatsFor("all"),
    duplicates: stats.received.packetDuplicates,
    duplicatesPerSecond: stats.received.duplicatesPerSecond,
    duplicatesPercentage: stats.received.duplicatePercentage,
    connectedPeers: catalystPeer.fullyConnectedPeerIds(),
    knownPeersCount: Object.keys(catalystPeer.knownPeers).length,
    position: catalystPeer.selfPosition(),
  };

  const latencies = Object.values(catalystPeer.knownPeers)
    .map((kp) => kp.latency!)
    .filter((it) => typeof it !== "undefined");

  if (latencies.length > 0) {
    statsToSubmit["averageLatency"] = average(latencies);
  }

  return statsToSubmit;
}
