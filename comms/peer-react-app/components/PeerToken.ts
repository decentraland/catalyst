import { util } from "../../peer/src/peerjs-server-connector/util";

export const PeerToken = {
  getToken(nickname: string): string {
    const key = `${nickname}_token`;
    let token = localStorage.getItem(key);
    if (!token) {
      token = util.generateToken(64);
      localStorage.setItem(key, token);
    }

    return token;
  }
};
