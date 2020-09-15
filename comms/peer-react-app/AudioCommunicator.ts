import { IPeer } from "../peer/src/types";
import { AudioWorkerMain } from "../peer-react-app/audioWorkerMain";
import { PeerMessageType } from "../peer/src/messageTypes";
import { RingBuffer } from "decentraland-katalyst-utils/RingBuffer";

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
  private buffers: Record<string, RingBuffer<Float32Array>> = {};
  private outputProcessors: Record<string, ScriptProcessorNode> = {};
  public readonly outputs: Record<string, MediaStreamAudioDestinationNode> = {};
  private audioWorkerMain: AudioWorkerMain;

  private readonly sampleRate = 48000;
  private readonly channelBufferSize = 0.5;

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
      this.buffers[src] = new RingBuffer(Math.floor(this.channelBufferSize * this.sampleRate), Float32Array);
    }

    if (!this.outputProcessors[src]) {
      this.createAudioOutputFor(src);
    }

    let stream = this.audioWorkerMain.decodeStreams[src];

    if (!stream) {
      stream = this.audioWorkerMain.getOrCreateDecodeStream(src, this.sampleRate);

      stream.addAudioDecodedListener((samples) => this.buffers[src].write(samples));
    }

    stream.decode(encoded);
  }

  createAudioOutputFor(src: string) {
    // this.outputs[src] = this.context.createMediaStreamDestination();
    this.outputProcessors[src] = this.context.createScriptProcessor(8192, 0, 1);
    this.outputProcessors[src].onaudioprocess = (ev) => {
      const data = ev.outputBuffer.getChannelData(0);

      data.fill(0);

      if (this.buffers[src] && this.buffers[src].readAvailableCount() > 0) {
        data.set(this.buffers[src].read(data.length));
      }
    };

    this.outputProcessors[src].connect(this.context.destination);
  }

  start() {
    this.processor.connect(this.context.destination);
  }

  pause() {
    this.processor.disconnect(this.context.destination);
  }
}
