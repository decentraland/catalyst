import { IPeer } from "../peer/src/types";
import { AudioWorkerMain } from "../peer-react-app/audioWorkerMain";
import { PeerMessageType } from "../peer/src/messageTypes";

const VoiceType: PeerMessageType = {
  name: "voice",
  ttl: 5,
  optimistic: true,
  discardOlderThan: 0,
  expirationTime: 6000,
};

export type AudioCommunicatorChannel = {
  send(data: ArrayBuffer): any;
};

export const AudioCommunicatorChannel = {
  fromPeer(roomId: string, peer: IPeer): AudioCommunicatorChannel {
    return {
      send(data: Uint8Array) {
        peer.sendMessage(roomId, new Uint8Array(data), VoiceType);
      },
    };
  },
};

export class AudioCommunicator {
  private context: AudioContext;
  private processor: ScriptProcessorNode;
  private input: MediaStreamAudioSourceNode;
  private buffers: Record<string, Float32Array[]> = {};
  private outputs: Record<string, ScriptProcessorNode> = {};
  private audioWorkerMain: AudioWorkerMain;

  private readonly sampleRate = 48000;

  constructor(selfId: string, stream: MediaStream, channel: AudioCommunicatorChannel) {
    this.context = new AudioContext({ sampleRate: this.sampleRate });
    this.input = this.context.createMediaStreamSource(stream);
    this.processor = this.context.createScriptProcessor(2048, 1, 1);
    this.audioWorkerMain = new AudioWorkerMain();
    const encodeStream = this.audioWorkerMain.getOrCreateEncodeStream(selfId, this.sampleRate);
    encodeStream.addAudioEncodedListener((data) => channel.send(data));

    this.input.connect(this.processor);

    this.processor.onaudioprocess = async function (e) {
      const buffer = e.inputBuffer;
      encodeStream.encode(buffer.getChannelData(0));
    };
  }

  async playEncodedAudio(src: string, encoded: Uint8Array) {
    if (!this.buffers[src]) {
      this.buffers[src] = [];
    }

    if (!this.outputs[src]) {
      this.createScriptProcessorFor(src);
    }

    let stream = this.audioWorkerMain.decodeStreams[src];

    if (!stream) {
      stream = this.audioWorkerMain.getOrCreateDecodeStream(src, this.sampleRate);

      stream.addAudioDecodedListener((samples) => this.buffers[src].push(samples));
    }

    stream.decode(encoded);
  }

  createScriptProcessorFor(src: string): ScriptProcessorNode {
    this.outputs[src] = this.context.createScriptProcessor(16384, 0, 1);
    this.outputs[src].onaudioprocess = (ev) => {
      const data = ev.outputBuffer.getChannelData(0);

      data.fill(0);

      if (this.buffers[src] && this.buffers[src].length > 0) {
        let currentBuffer = this.buffers[src].shift();
        let outputBufferConsumed = 0;
        while (outputBufferConsumed < data.length && currentBuffer) {
          const remainingBuffer = data.length - outputBufferConsumed;

          if (currentBuffer.length <= remainingBuffer) {
            data.set(currentBuffer, outputBufferConsumed);
            outputBufferConsumed += currentBuffer.length;
            currentBuffer = this.buffers[src].shift();
          } else {
            data.set(currentBuffer.slice(0, remainingBuffer), outputBufferConsumed);
            outputBufferConsumed += remainingBuffer;
            this.buffers[src].unshift(currentBuffer.slice(remainingBuffer));
          }
        }
      }
    };

    this.outputs[src].connect(this.context.destination);

    return this.outputs[src];
  }

  start() {
    this.processor.connect(this.context.destination);
  }

  pause() {
    this.processor.disconnect(this.context.destination);
  }
}
