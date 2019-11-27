// import PeerJS from "peerjs";



export class Peer implements IPeer {
//@ts-ignore
  constructor(private lighthouseUrl: string, public nickname: string) {
  
  }

  joinRoom(room: string): Promise<void> {
    return Promise.resolve();   
  }
}

export interface IPeer {
  nickname: string
  joinRoom(room: string): Promise<void>
}