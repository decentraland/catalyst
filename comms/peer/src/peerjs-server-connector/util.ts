import { DEFAULT_ID_ALPHABET } from '../../../../commons/utils/util'

// const DEFAULT_CONFIG = {
//   iceServers: [
//     { urls: "stun:stun.l.google.com:19302" },
//     {
//       urls: "turn:0.peerjs.com:3478",
//       username: "peerjs",
//       credential: "peerjsp"
//     }
//   ],
//   sdpSemantics: "unified-plan"
// };

export const util = new (class {
  noop(): void {}

  readonly CLOUD_HOST = '0.peerjs.com'
  readonly CLOUD_PORT = 443

  // Ensure supported ids
  validateId(id: string): boolean {
    // Allow empty ids
    return !id || Array.from(id).every((it) => DEFAULT_ID_ALPHABET.includes(it))
  }

  randomToken(): string {
    return Math.random().toString(36).substr(2)
  }

  generateToken(n: number) {
    var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    var token = ''
    for (var i = 0; i < n; i++) {
      token += chars[Math.floor(Math.random() * chars.length)]
    }
    return token
  }
})()

export function connectionIdFor(myId: string, peerId: string, sessionId: string) {
  return `${myId < peerId ? myId : peerId}_${myId < peerId ? peerId : myId}_${sessionId}`
}

export function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time))
}

export function shuffle<T>(array: T[]): T[] {
  return array.sort(() => 0.5 - Math.random())
}

export function noReject<T>(promise: Promise<T>): Promise<['fulfilled' | 'rejected', any]> {
  return promise.then(
    (value) => ['fulfilled', value],
    (error) => ['rejected', error]
  )
}

/**
 * Picks count random elements from the array and returns them and the remaining elements. If the array
 * has less or equal elements than the amount required, then it returns a copy of the array.
 */
export function pickRandom<T>(array: T[], count: number): [T[], T[]] {
  return pickBy(array, count, () => 0.5 - Math.random())
}

/**
 * Picks the top `count` elements according to `criteria` from the array and returns them and the remaining elements. If the array
 * has less or equal elements than the amount required, then it returns a copy of the array sorted by `criteria`.
 */
export function pickBy<T>(array: T[], count: number, criteria: (t1: T, t2: T) => number): [T[], T[]] {
  const sorted = array.sort(criteria)

  const selected = sorted.splice(0, count)

  return [selected, sorted]
}
