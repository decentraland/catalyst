enum RequestTopic {
  ENCODE = "ENCODE",
  DECODE = "DECODE",
}

enum ResponseTopic {
  ENCODE = "ENCODE_OUTPUT",
  DECODE = "DECODE_OUTPUT",
}

type EncodeListener = (encoded: Uint8Array) => any;
type DecodeListener = (samples: Float32Array) => any;

type EncodeStream = {
  encode(samples: Float32Array): void;
  addAudioEncodedListener(listener: EncodeListener): void;
};

type DecodeStream = {
  decode(encoded: Uint8Array): void;
  addAudioDecodedListener(listener: DecodeListener): void;
};

export class AudioWorkerMain {
  private requestId: number = 0;
  private audioWorker: Worker;

  private encodeListeners: Record<string, EncodeListener[]> = {};
  private decodeListeners: Record<string, DecodeListener[]> = {};

  public readonly encodeStreams: Record<string, EncodeStream> = {};
  public readonly decodeStreams: Record<string, DecodeStream> = {};

  constructor() {
    this.audioWorker = new Worker("static/audioWorker.js");
    this.audioWorker.onmessage = (ev) => {
      if (ev.data.topic === ResponseTopic.ENCODE) {
        this.encodeListeners[ev.data.streamId]?.forEach((listener) => listener(ev.data.encoded));
      } else if (ev.data.topic === ResponseTopic.DECODE) {
        this.decodeListeners[ev.data.streamId]?.forEach((listener) => listener(ev.data.samples));
      } else {
        console.warn("Unknown message topic received from worker", ev);
      }
    };
  }

  private generateId() {
    return this.requestId++;
  }

  getOrCreateEncodeStream(streamId: string, sampleRate: number): EncodeStream {
    return (this.encodeStreams[streamId] = this.encodeStreams[streamId] || {
      encode: (samples) => {
        this.sendRequestToWorker({ topic: RequestTopic.ENCODE, sampleRate: sampleRate, samples, streamId });
      },
      addAudioEncodedListener: (listener) => {
        this.addAudioEncodedListener(streamId, listener);
      },
    });
  }

  getOrCreateDecodeStream(streamId: string, sampleRate: number): DecodeStream {
    return (this.decodeStreams[streamId] = this.decodeStreams[streamId] || {
      decode: (encoded) => {
        this.sendRequestToWorker({ topic: RequestTopic.DECODE, sampleRate: sampleRate, encoded, streamId });
      },
      addAudioDecodedListener: (listener) => {
        this.addAudioDecodedListener(streamId, listener);
      },
    });
  }

  private addListenerFor<T>(streamId: string, listeners: Record<string, T[]>, listener: T) {
    if (!listeners[streamId]) {
      listeners[streamId] = [];
    }

    listeners[streamId].push(listener);
  }

  addAudioEncodedListener(streamId: string, listener: EncodeListener) {
    this.addListenerFor(streamId, this.encodeListeners, listener);
  }

  addAudioDecodedListener(streamId: string, listener: DecodeListener) {
    this.addListenerFor(streamId, this.decodeListeners, listener);
  }

  private sendRequestToWorker(message: { topic: RequestTopic } & any) {
    const id = this.generateId();
    message.id = id;
    this.audioWorker.postMessage(message);
  }
}

// const pendingRequests: Record<number, { resolve: Function; reject: Function }> = {};

// audioWorker.onmessage = (ev) => {
//   const pendingRequest = pendingRequests[ev.data.id];
//   if (ev.data.topic === ResponseTopic.ENCODE) {
//     pendingRequest.resolve(ev.data.encoded);
//   } else if (ev.data.topic === ResponseTopic.DECODE) {
//     pendingRequest.resolve({ samples: ev.data.samples, sampleRate: ev.data.sampleRate });
//   } else {
//     console.warn("Unknown message topic received from worker", ev);
//   }
// };

// export async function encodeAudio(samples: Float32Array, sampleRate: number): Promise<Uint8Array> {
//   return sendRequestToWorker({ topic: RequestTopic.ENCODE, sampleRate: sampleRate, samples });
// }

// export async function decodeAudio(encoded: Uint8Array): Promise<{ samples: Float32Array; sampleRate: number }> {
//   return sendRequestToWorker({ topic: RequestTopic.DECODE, encoded });
// }

// export function addAudioEncodedListener

// function sendRequestToWorker<T>(message: { topic: RequestTopic } & any) {
//   const id = generateId();
//   message.id = id;
//   audioWorker.postMessage(message);
//   return requestPromiseWithTimeout<T>(id);
// }

// function requestPromiseWithTimeout<T>(id: number) {
//   return new Promise<T>((resolve, reject) => {
//     pendingRequests[id] = { resolve, reject };
//     setTimeout(() => {
//       if (pendingRequests[id]) {
//         pendingRequests[id].reject(new Error("Request timed out!"));
//         delete pendingRequests[id];
//       }
//     }, 5000);
//   });
// }
