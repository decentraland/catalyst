import { Packet } from './proto/peer_protobuf'
import { Peer } from './Peer'
import { average } from '../../../commons/utils/util'

type PeriodicValue = {
  accumulatedInPeriod: number
  currentValue?: number
  lastAccumulatedValue?: number
}

function newPeriodicValue() {
  return { accumulatedInPeriod: 0 }
}

export class Stats {
  public averagePacketSize?: number = undefined
  public totalPackets: number = 0
  public totalBytes: number = 0

  public lastPeriodUpdate: number = 0

  // Periodic stats. Each of these need to accumulate during a period to calculate their values
  public _bytesPerSecond: PeriodicValue = newPeriodicValue()
  public _packetsPerSecond: PeriodicValue = newPeriodicValue()

  public get bytesPerSecond() {
    return this._bytesPerSecond.currentValue
  }

  public get periodBytes() {
    return this._bytesPerSecond.lastAccumulatedValue
  }

  public get packetsPerSecond() {
    return this._packetsPerSecond.currentValue
  }

  public get periodPackets() {
    return this._packetsPerSecond.lastAccumulatedValue
  }

  countPacket(packet: Packet, length: number, duplicate: boolean = false, expired: boolean = false) {
    this.totalPackets += 1

    this._packetsPerSecond.accumulatedInPeriod += 1

    this.totalBytes += length
    this._bytesPerSecond.accumulatedInPeriod += length

    this.averagePacketSize = this.totalBytes / this.totalPackets
  }

  onPeriod(timestamp: number) {
    const elapsed = this.lastPeriodUpdate ? timestamp - this.lastPeriodUpdate : 0
    const calculateAndReset = (value: PeriodicValue) => {
      if (elapsed) {
        value.currentValue = (value.accumulatedInPeriod * 1000) / elapsed
      }
      value.lastAccumulatedValue = value.accumulatedInPeriod
      value.accumulatedInPeriod = 0
    }

    calculateAndReset(this._bytesPerSecond)
    calculateAndReset(this._packetsPerSecond)

    this.lastPeriodUpdate = timestamp
  }
}

export class TypedStats extends Stats {
  public statsByType: Record<string, Stats> = {}

  countPacket(packet: Packet, length: number) {
    super.countPacket(packet, length)
    if (packet.subtype) {
      const stats = (this.statsByType[packet.subtype] = this.statsByType[packet.subtype] ?? new Stats())
      stats.countPacket(packet, length)
    }
  }

  onPeriod(timestamp: number) {
    super.onPeriod(timestamp)
    Object.values(this.statsByType).forEach((it) => it.onPeriod(timestamp))
  }
}

type PacketOperationType = 'sent' | 'received' | 'relayed'

export class GlobalStats {
  public sent: TypedStats = new TypedStats()
  public received: TypedStats = new TypedStats()
  public relayed: TypedStats = new TypedStats()
  public all: TypedStats = new TypedStats()

  public tagged: Record<string, TypedStats> = {}

  private periodId?: number

  public onPeriodicStatsUpdated: (stats: GlobalStats) => void = (_) => {}

  constructor(public periodLength: number = 1000) {}

  countPacket(packet: Packet, length: number, operation: PacketOperationType, tags: string[] = []) {
    this.all.countPacket(packet, length)
    this[operation].countPacket(packet, length)
    tags.forEach((tag) => {
      if (!this.tagged[tag]) {
        this.tagged[tag] = new TypedStats()
      }

      this.tagged[tag].countPacket(packet, length)
    })
  }

  onPeriod(timestamp: number) {
    this.all.onPeriod(timestamp)
    this.sent.onPeriod(timestamp)
    this.received.onPeriod(timestamp)
    this.relayed.onPeriod(timestamp)
    Object.values(this.tagged).forEach((it) => it.onPeriod(timestamp))
  }

  startPeriod() {
    const periodFunction = () => {
      this.onPeriod(performance.now())
      this.onPeriodicStatsUpdated(this)
      this.periodId = setTimeout(periodFunction, this.periodLength) as any
    }

    periodFunction()
  }

  dispose() {
    clearTimeout(this.periodId)
  }

  getStatsFor(statsKey: string): TypedStats | undefined {
    if (this.hasOwnProperty(statsKey)) {
      return this[statsKey]
    } else {
      return this.tagged[statsKey]
    }
  }
}

/**
 * Helper function to build a data object to submit the stats for analytics
 */
export function buildCatalystPeerStatsData(catalystPeer: Peer) {
  const stats = catalystPeer.stats

  function buildStatsFor(statsKey: string) {
    const result: Record<string, any> = {}
    const typedStats = stats.getStatsFor(statsKey)
    result[statsKey] = typedStats?.periodPackets ?? 0
    result[`${statsKey}Total`] = typedStats?.totalPackets ?? 0
    result[`${statsKey}PerSecond`] = typedStats?.packetsPerSecond ?? 0
    result[`${statsKey}Bytes`] = typedStats?.periodBytes ?? 0
    result[`${statsKey}TotalBytes`] = typedStats?.totalBytes ?? 0
    result[`${statsKey}BytesPerSecond`] = typedStats?.bytesPerSecond ?? 0
    result[`${statsKey}AveragePacketSize`] = typedStats?.averagePacketSize ?? 0
    return result
  }
  const statsToSubmit = {
    ...buildStatsFor('sent'),
    ...buildStatsFor('received'),
    ...buildStatsFor('relayed'),
    ...buildStatsFor('all'),
    ...buildStatsFor('relevant'),
    ...buildStatsFor('duplicate'),
    ...buildStatsFor('expired'),
    connectedPeers: catalystPeer.fullyConnectedPeerIds(),
    knownPeersCount: Object.keys(catalystPeer.knownPeers).length,
    position: catalystPeer.selfPosition()
  }

  const latencies = Object.values(catalystPeer.knownPeers)
    .map((kp) => kp.latency!)
    .filter((it) => typeof it !== 'undefined')

  if (latencies.length > 0) {
    statsToSubmit['averageLatency'] = average(latencies)
  }

  return statsToSubmit
}
