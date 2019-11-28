import { IPeer , Room} from "./Peer";

export class PeerStub implements IPeer {
    currentRooms: Room[] = []
    joinRoom(room: string): Promise<void> {
        console.log("Joining room...") 
        return new Promise((resolve, _) => {
            setTimeout(() => {
                console.log("Room Joined")
                this.currentRooms.push({id: room, users: []})
                resolve()
            }, 800)
             
        })
    }
    constructor(public url: string, public nickname: string) {
        console.log(`Created peer: ${url} - ${nickname}` )
    }
}