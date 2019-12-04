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

  isSecure(): boolean {
    return location.protocol === "https:";
  }
})();
