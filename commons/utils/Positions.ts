export const DISCRETIZE_POSITION_INTERVAL = 50;

export type Position3D = [number, number, number];
export type Position2D = [number, number];

export type Position = Position2D | Position3D;

export function isPosition3D(position: any): position is Position3D {
  return position instanceof Array && position.length === 3;
}

export function isPosition2D(position: any): position is Position2D {
  return position instanceof Array && position.length === 2;
}

export function discretizedPositionDistance(a: Position, b: Position, interval: number = DISCRETIZE_POSITION_INTERVAL) {
  let dx = 0;
  let dy = 0;
  let dz = 0;

  dx = a[0] - b[0];
  dy = a[1] - b[1];

  if (isPosition3D(a) && isPosition3D(b)) {
    dz = a[2] - b[2];
  }

  return Math.floor((dx * dx + dy * dy + dz * dz) / (interval * interval));
}

export type PeerConnectionHint = {
  id: string;
  distance: number;
  position: Position;
};