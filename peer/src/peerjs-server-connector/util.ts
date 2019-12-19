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

  generateToken(n: number) {
    var chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    var token = "";
    for (var i = 0; i < n; i++) {
      token += chars[Math.floor(Math.random() * chars.length)];
    }
    return token;
  }
})();

export const ConnectionSuffixes = {
  reliable: "reliable",
  unreliable: "unreliable"
};

export function connectionIdFor(
  myId: string,
  peerId: string,
  sessionId: string,
  reliable: boolean
) {
  return `${myId < peerId ? myId : peerId}_${myId < peerId ? peerId : myId}_${sessionId}_${
    reliable ? ConnectionSuffixes.reliable : ConnectionSuffixes.unreliable
  }`;
}

export function isReliable(connectionId: string) {
  return !connectionId.endsWith(ConnectionSuffixes.unreliable);
}

export function delay(time: number) {
  return new Promise(resolve => setTimeout(resolve, time));
}
