import Peer from "peerjs";

export function connect() {
  const peer = new Peer(new Date().getTime().toString());

  const conn = peer.connect("another-peers-id");

  conn.on("open", () => {
    conn.send("hi!");
  });
}
