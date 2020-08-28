LIBOPUS_WASM_URL = "lib/libopus.wasm";

importScripts("lib/libopus.wasm.js");

if (typeof require != "undefined" && typeof libopus == "undefined") {
  libopus = require("lib/libopus.wasm.js");
}

function getSampleRate(e) {
  return e.data.sampleRate ? e.data.sampleRate : 48000;
}

const encoderWorklets = {};
const decoderWorklets = {};

function startWorklet(streamId, worklet, outputFunction, messageBuilder) {
  worklet.working = true;

  function doWork() {
    let output = outputFunction(worklet);

    if (output) {
      postMessage(messageBuilder(output, streamId));
      setTimeout(doWork, 0);
    } else {
      worklet.working = false;
    }
  }

  setTimeout(doWork, 0);
}

//Encoder(channels, samplerate, bitrate, frame_size, voice_optimization)

onmessage = function (e) {
  if (e.data.topic === "ENCODE") {
    const sampleRate = getSampleRate(e);
    const encoderWorklet = (encoderWorklets[e.data.streamId] = encoderWorklets[e.data.streamId] || {
      working: false,
      encoder: new libopus.Encoder(1, sampleRate, 24000, 20, true),
    });

    const samples = toInt16Samples(e.data.samples);

    encoderWorklet.encoder.input(samples);

    if (!encoderWorklet.working) {
      startWorklet(
        e.data.streamId,
        encoderWorklet,
        (worklet) => worklet.encoder.output(),
        (output, streamId) => ({ topic: "ENCODE_OUTPUT", streamId: streamId, encoded: output })
      );
    }
  }

  if (e.data.topic === "DECODE") {
    const sampleRate = getSampleRate(e);
    const decoderWorklet = (decoderWorklets[e.data.streamId] = decoderWorklets[e.data.streamId] || { working: false, decoder: new libopus.Decoder(1, sampleRate) });

    decoderWorklet.decoder.input(e.data.encoded);

    if (!decoderWorklet.working) {
      startWorklet(
        e.data.streamId,
        decoderWorklet,
        (worklet) => worklet.decoder.output(),
        (output, streamId) => ({
          topic: "DECODE_OUTPUT",
          streamId,
          samples: toFloat32Samples(output),
        })
      );
    }
  }
};

function toInt16Samples(floatSamples) {
  return Int16Array.from(floatSamples, (floatSample) => {
    let val = Math.floor(32767 * floatSample);
    val = Math.min(32767, val);
    val = Math.max(-32768, val);
    return val;
  });
}

function toFloat32Samples(intSamples) {
  return Float32Array.from(intSamples, (intSample) => {
    let floatValue = intSample >= 0 ? intSample / 32767 : intSample / 32768;
    return Math.fround(floatValue);
  });
}
