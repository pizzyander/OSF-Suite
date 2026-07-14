// pcm-processor.js
//
// This runs on a separate, dedicated audio thread (not the main React thread).
// Its only job: grab raw microphone samples as they arrive, convert them from
// the browser's native format (Float32, values between -1 and 1) into 16-bit
// PCM integers (values between -32768 and 32767) — the format Deepgram's
// streaming API expects — and hand those bytes back to our React code.
//
// Analogy: think of this as a translator standing at the factory conveyor
// belt. Raw audio parts come off the line continuously; this translator
// repackages each part into the exact shape the next machine (Deepgram)
// needs, without ever pausing the belt to do it.

class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true // no audio yet, keep processor alive

    const float32Samples = input[0] // mono channel, values -1.0 to 1.0
    const int16Samples = new Int16Array(float32Samples.length)

    for (let i = 0; i < float32Samples.length; i++) {
      // Clamp to [-1, 1] defensively, then scale to the 16-bit integer range.
      const clamped = Math.max(-1, Math.min(1, float32Samples[i]))
      int16Samples[i] = clamped < 0 ? clamped * 32768 : clamped * 32767
    }

    // Send the converted bytes back to the main thread (our React hook).
    this.port.postMessage(int16Samples.buffer, [int16Samples.buffer])

    return true // keep this processor running
  }
}

registerProcessor('pcm-processor', PCMProcessor)