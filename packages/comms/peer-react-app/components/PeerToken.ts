import { util } from "../../peer/src/peerjs-server-connector/util";

export const PeerToken = {
  getToken(peerId: string): string {
    const key = `${peerId}_token`;
    let token = localStorage.getItem(key);
    if (!token) {
      token = util.generateToken(64);
      localStorage.setItem(key, token);
    }

    return token;
  }
};
