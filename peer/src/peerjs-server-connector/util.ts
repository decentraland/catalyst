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

  readonly CLOUD_HOST = "0.peerjs.com";
  readonly CLOUD_PORT = 443;

  // Ensure alphanumeric ids
  validateId(id: string): boolean {
    // Allow empty ids
    return !id || /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/.test(id);
  }

  randomToken(): string {
    return Math.random()
      .toString(36)
      .substr(2);
  }
})();

export const ConnectionSuffixes = {
  reliable: "reliable",
  unreliable: "unreliable"
};

//TODO: Currently the connection id is mirrored, from peer to peer. We may want to make them the same.
export function connectionIdFor(
  myId: string,
  peerId: string,
  reliable: boolean
) {
  return `${myId < peerId ? myId : peerId}_${myId < peerId ? peerId : myId}_${
    reliable ? ConnectionSuffixes.reliable : ConnectionSuffixes.unreliable
  }`;
}

export function isReliable(connectionId: string) {
  return !connectionId.endsWith(ConnectionSuffixes.unreliable);
}

export function delay(time: number) {
  return new Promise(resolve => setTimeout(resolve, time))
}
