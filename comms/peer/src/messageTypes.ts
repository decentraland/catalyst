
export type TTLInterleaving = {
  interval: number;
  ttls: [
    {
      from: number;
      to: number;
      ttl: number;
    }
  ];
};

export type TTLFunction = (index: number, type: PeerMessageType) => number  

export type PeerMessageType = {
  /**
   * Time to Live of the messages of this particular type. How many hops will the message do before being discarded.
   * It can be set to a number, or to an interleaving (to have variable TTL depending on the index of the message).
   * 
   * NOTE: Interleaving is not implemented yet.
   */
  ttl?: number | TTLInterleaving | TTLFunction; 
  /**
  * If the time since received the last message of the same type (calculated using the message timestamp) is greater than this value,
  * then the message is discarded. Set to 0 to discard al messages older than the last one. 
  */ 
  discardOlderThan?: number;
  /**
  * Time to preserve the messages in the list of known messages, in order to avoid processing them multiple times.
  * If a message is received with a timestamp which indicates that it is older than this expiration time (calculated using the timestamp of the known peer),
  * then the message is discarded directly. 
  */ 
  expirationTime?: number;

  /**
   * The name of the type is used as a key for some data structures, so it should be unique
   */
  name: string;
};

export const PeerMessageTypes = {
  reliable: {
    name: "reliable",
    ttl: 10,
    expirationTime: 20 * 1000
  },
  unreliable: {
    name: "unreliable",
    ttl: 10, 
    discardOlderThan: 0,
    expirationTime: 2000
  }
};
