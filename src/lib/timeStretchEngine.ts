// Main-thread side of the song player in timeStretchWorklet. A song is copied
// to the audio thread once, then each play, seek or loop starts a SongVoice:
// an AudioBufferSourceNode stand-in on the same clock that keeps the pitch
// whenever the rate is below `stretchBelow`. Instead of a playbackRate param
// it is handed useAudio's own playback model, so it plays exactly where the
// playhead says, from its first block and through every ramp; AudioParam
// curves can be dropped by the browser, and were.
import workletUrl from "./timeStretchWorklet.ts?worker&url";
import type { RateTransition } from "./rateTransition";
import {
  STRETCH_STORE_PROCESSOR,
  STRETCH_VOICE_PROCESSOR,
} from "./liveTimeStretch";

const stores = new WeakMap<BaseAudioContext, Promise<AudioWorkletNode | null>>();

/** The node songs are handed to, or null where AudioWorklet is unavailable. */
function storeFor(ctx: AudioContext): Promise<AudioWorkletNode | null> {
  let store = stores.get(ctx);
  if (!store) {
    store = (async () => {
      // Missing outside secure contexts and in old browsers.
      if (!ctx.audioWorklet || typeof AudioWorkletNode === "undefined") return null;
      try {
        await ctx.audioWorklet.addModule(workletUrl);
        // Never connected; a node must have an input or an output, though.
        return new AudioWorkletNode(ctx, STRETCH_STORE_PROCESSOR, {
          numberOfInputs: 0,
          numberOfOutputs: 1,
        });
      } catch (err) {
        console.warn("Pitch-kept playback is unavailable:", err);
        return null;
      }
    })();
    stores.set(ctx, store);
  }
  return store;
}

let nextSongId = 1;

export type StretchSongHandle = {
  readonly id: number;
  readonly ctx: AudioContext;
  readonly buffer: AudioBuffer;
  release(): void;
};

/**
 * Copies `buffer` onto the audio thread for SongVoice to play. Resolves once
 * it has arrived, or null when this context cannot run the worklet.
 */
export async function loadStretchSong(
  ctx: AudioContext,
  buffer: AudioBuffer,
): Promise<StretchSongHandle | null> {
  const store = await storeFor(ctx);
  if (!store) return null;
  const id = nextSongId++;
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    channels.push(buffer.getChannelData(ch).slice());
  }
  let released = false;
  const handle: StretchSongHandle = {
    id,
    ctx,
    buffer,
    release() {
      if (released) return;
      released = true;
      store.port.postMessage({ type: "drop", id });
    },
  };
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "stored" || event.data.id !== id) return;
      store.port.removeEventListener("message", onMessage);
      resolve(handle);
    };
    store.port.addEventListener("message", onMessage);
    store.port.start();
    store.port.postMessage(
      { type: "put", id, sampleRate: buffer.sampleRate, channels },
      channels.map((channel) => channel.buffer),
    );
  });
}

/**
 * Plays a loaded song along a playback model, keeping its pitch while the
 * rate is below `stretchBelow` (Infinity: always; 0: never).
 */
export class SongVoice {
  onended: ((event: Event) => void) | null = null;
  private readonly node: AudioWorkletNode;

  constructor(song: StretchSongHandle, stretchBelow: number) {
    this.node = new AudioWorkletNode(song.ctx, STRETCH_VOICE_PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [song.buffer.numberOfChannels],
      processorOptions: { id: song.id, stretchBelow },
    });
    this.node.port.onmessage = (event: MessageEvent) => {
      if (event.data?.type !== "ended") return;
      this.node.port.onmessage = null;
      this.onended?.(new Event("ended"));
    };
  }

  connect(destination: AudioNode): void {
    this.node.connect(destination);
  }

  disconnect(): void {
    this.node.disconnect();
  }

  /**
   * Starts playing once `when` comes (0: now), wherever `transition` puts the
   * song by then, and follows it from there.
   */
  start(when: number, transition: RateTransition): void {
    this.node.port.postMessage({ type: "start", when, transition });
  }

  /** The playback model changed: a new rate, ramped or not. */
  follow(transition: RateTransition): void {
    this.node.port.postMessage({ type: "follow", transition });
  }

  stop(when = 0): void {
    this.node.port.postMessage({ type: "stop", when });
  }

  setStretchBelow(stretchBelow: number): void {
    this.node.port.postMessage({ type: "policy", stretchBelow });
  }
}
