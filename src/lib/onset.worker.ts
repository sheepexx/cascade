import { detectOnsetsFromChannels } from "./bpmDetect";
self.onmessage = (event: MessageEvent<{ channels: Float32Array[]; sampleRate: number }>) => {
  try {
    self.postMessage({ onsets: detectOnsetsFromChannels(event.data.channels, event.data.sampleRate) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Audio analysis failed." });
  }
};
