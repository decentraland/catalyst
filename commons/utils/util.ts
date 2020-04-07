export function delay(time: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, time));
}

export function shuffle<T>(array: T[]): T[] {
  return array.sort(() => 0.5 - Math.random());
}

export function noReject<T>(promise: Promise<T>): Promise<["fulfilled" | "rejected", any]> {
  return promise.then(
    value => ["fulfilled", value],
    error => ["rejected", error]
  );
}

/**
 * Picks count random elements from the array and returns them and the remaining elements. If the array
 * has less or equal elements than the amount required, then it returns a copy of the array.
 */
export function pickRandom<T>(array: T[], count: number): [T[], T[]] {
  const shuffled = shuffle(array);

  const selected = shuffled.splice(0, count);

  return [selected, shuffled];
}

export const MAX_UINT32 = 4294967295;

export function randomUint32(): number {
  return Math.floor(Math.random() * MAX_UINT32);
}

export function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function average(numbers: number[]) {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}
