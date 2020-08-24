import { VoiceType } from "../messageTypes";
import { IPeer } from "../types";

export type AudioCommunicatorChannel = {
  send(data: ArrayBuffer): any;
};

export const AudioCommunicatorChannel = {
  fromPeer(roomId: string, peer: IPeer): AudioCommunicatorChannel {
    return {
      send(data: ArrayBuffer) {
        peer.sendMessage(roomId, new Uint8Array(data), VoiceType);
      }
    };
  },
};

export class AudioCommunicator {
  private recorder: MediaRecorder;

  constructor(stream: MediaStream, channel: AudioCommunicatorChannel, mediaRecorderOptions: MediaRecorderOptions = { mimeType: "audio/webm;codecs=opus", audioBitrateMode: "vbr" }) {
    this.recorder = new MediaRecorder(stream, mediaRecorderOptions);

    this.recorder.addEventListener("dataavailable", (dataEvent) => {
      if (dataEvent.data.size > 0) {
        const reader = new FileReader();
        reader.addEventListener("loadend", () => {
          channel.send(reader.result as ArrayBuffer);
        });

        reader.readAsArrayBuffer(dataEvent.data);
      }
    });
  }

  start() {
    if(this.recorder.state === "paused") {
      this.recorder.resume();
    } else if(this.recorder.state === "inactive") {
      this.recorder.start(75);
    }
  }

  pause() {
    this.recorder.stop();
  }

  dispose() {
    this.recorder.stop();
  }
}
