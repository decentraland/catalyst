export const DISCRETIZE_POSITION_INTERVALS = [32, 64, 80, 128, 160]

export type Quaternion = [number, number, number, number]

export type Position3D = [number, number, number]

/**
 * Calculates the discretized distance between position a and position b, using the provided intervals (DISCRETIZE_POSITION_INTERVALS as default)
 *
 * For instance, given the intervals [32, 64, 80], then we get the following values:
 * - distance(a, b) = 30 => 0
 * - distance(a, b) = 50 => 1
 * - distance(a, b) = 64 => 1
 * - distance(a, b) = 77 => 2
 * - distance(a, b) = 90 => 3
 * - distance(a, b) = 99999 => 3
 *
 * The @param intervals provided should be ordered from lower to greater
 */
export function discretizedPositionDistanceXZ(intervals: number[] = DISCRETIZE_POSITION_INTERVALS) {
  return (a: Position3D, b: Position3D) => {
    let dx = 0
    let dz = 0

    dx = a[0] - b[0]

    dz = a[2] - b[2]

    const squaredDistance = dx * dx + dz * dz

    const intervalIndex = intervals.findIndex((it) => squaredDistance <= it * it)

    return intervalIndex !== -1 ? intervalIndex : intervals.length
  }
}

export type PeerConnectionHint = {
  id: string
  distance: number
  position: Position3D
}
