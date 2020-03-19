export const DISCRETIZE_POSITION_INTERVALS = [32, 64, 80];

export type Position3D = [number, number, number];
export type Position2D = [number, number];

export type Position = Position2D | Position3D;


export function isPosition3D(position: any): position is Position3D {
  return position instanceof Array && position.length === 3;
}

export function isPosition2D(position: any): position is Position2D {
  return position instanceof Array && position.length === 2;
}

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
 * 
 * @param a 
 * @param b 
 * @param intervals 
 */
export function discretizedPositionDistance(a: Position, b: Position, intervals: number[] = DISCRETIZE_POSITION_INTERVALS) {
  let dx = 0;
  let dy = 0;
  let dz = 0;

  dx = a[0] - b[0];
  dy = a[1] - b[1];

  if (isPosition3D(a) && isPosition3D(b)) {
    dz = a[2] - b[2];
  }

  const squaredDistance = (dx * dx + dy * dy + dz * dz)

  const intervalIndex = intervals.findIndex(it => squaredDistance <= it * it)

  return intervalIndex !== -1 ? intervalIndex : intervals.length;
}

export type PeerConnectionHint = {
  id: string;
  distance: number;
  position: Position;
};