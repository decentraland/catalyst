// import PeerJS from "peerjs";



export class Peer implements IPeer {
//@ts-ignore
  constructor(private lighthouseUrl: string, private nickname: string) {
  
  }

  joinRoom(room: string): Promise<void> {
    return Promise.resolve();   
  }
}

export interface IPeer {
  joinRoom(room: string): Promise<void>
}