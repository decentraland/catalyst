import { Packet } from "./proto/peer_protobuf";

type PeriodicValue = {
  accumulatedInPeriod: number;
  currentValue?: number;
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
  private _bytesPerSecond: PeriodicValue = newPeriodicValue();
  private _packetsPerSecond: PeriodicValue = newPeriodicValue();
  private _expiredPerSecond: PeriodicValue = newPeriodicValue();
  private _duplicatesPerSecond: PeriodicValue = newPeriodicValue();

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

    if (duplicate) this.packetDuplicates += 1;

    this._duplicatesPerSecond.accumulatedInPeriod += 1;

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
      value.accumulatedInPeriod = 0;
    };

    calculateAndReset(this._bytesPerSecond);
    calculateAndReset(this._packetsPerSecond);
    calculateAndReset(this._expiredPerSecond);
    calculateAndReset(this._duplicatesPerSecond);

    this.lastPeriodUpdate = timestamp;
  }
}

export class GlobalStats extends Stats {
  public statsByType: Record<string, Stats> = {};
  private periodId?: number;

  constructor(private periodLength: number = 1000) {
    super();
  }

  countPacket(packet: Packet, length: number, duplicate: boolean = false, expired: boolean = false) {
    super.countPacket(packet, length, duplicate, expired);
    if (packet.subtype) {
      const stats = (this.statsByType[packet.subtype] = this.statsByType[packet.subtype] ?? new Stats());
      stats.countPacket(packet, length, duplicate, expired);
    }
  }

  onPeriod(timestamp: number) {
    super.onPeriod(timestamp);
    Object.values(this.statsByType).forEach(it => it.onPeriod(timestamp));
  }

  startPeriod() {
    const periodFunction = () => {
      this.onPeriod(Date.now());
      this.periodId = setTimeout(periodFunction, this.periodLength) as any;
    };

    periodFunction();
  }

  dispose() {
    clearTimeout(this.periodId);
  }
}
