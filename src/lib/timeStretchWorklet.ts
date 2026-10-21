// Runs on the audio rendering thread. Songs are copied in once through the
// store processor and shared by every voice, so starting a voice for a play,
// a seek or a loop costs nothing but the node. See timeStretchEngine for the
// main-thread side and songRenderer for the playback itself.
import {
  STRETCH_STORE_PROCESSOR,
  STRETCH_VOICE_PROCESSOR,
  type StretchSong,
} from "./liveTimeStretch";
import { positionAt, type RateTransition } from "./rateTransition";
import { SongRenderer } from "./songRenderer";

declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

const songs = new Map<number, StretchSong>();

class StretchStoreProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === "put") {
        songs.set(message.id, {
          channels: message.channels,
          sampleRate: message.sampleRate,
        });
        this.port.postMessage({ type: "stored", id: message.id });
      } else if (message?.type === "drop") {
        songs.delete(message.id);
      }
    };
  }

  process(): boolean {
    return true;
  }
}

class SongVoiceProcessor extends AudioWorkletProcessor {
  private readonly id: number;
  private stretchBelow: number;
  private startAt = Number.NaN;
  /**
   * The playback model the playhead is drawn from, sent on every change. The
   * voice plays exactly where it says, from its very first block: unlike a
   * buffer source it does not start a message's journey late.
   */
  private transition: RateTransition | null = null;
  private stopAt = Number.POSITIVE_INFINITY;
  private player: SongRenderer | null = null;
  private finished = false;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    const config = options.processorOptions as { id: number; stretchBelow: number };
    this.id = config.id;
    this.stretchBelow = config.stretchBelow;
    this.port.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === "start" && Number.isNaN(this.startAt)) {
        this.startAt = message.when;
        this.transition = message.transition;
      } else if (message?.type === "follow") {
        this.transition = message.transition;
      } else if (message?.type === "stop") {
        this.stopAt = Math.min(this.stopAt, message.when);
        if (this.stopAt <= currentTime) this.finish();
      } else if (message?.type === "policy") {
        this.stretchBelow = message.stretchBelow;
        if (this.player) this.player.stretchBelow = message.stretchBelow;
      }
    };
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.player = null;
    this.port.postMessage({ type: "ended" });
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.finished) return false;
    const output = outputs[0] ?? [];
    const frames = output[0]?.length ?? 0;
    for (const channel of output) channel.fill(0);
    const transition = this.transition;
    if (Number.isNaN(this.startAt) || !transition || frames === 0) return true;

    const frameAt = (time: number) =>
      Math.max(0, Math.min(frames, Math.round((time - currentTime) * sampleRate)));
    const from = frameAt(this.startAt);
    const to = frameAt(this.stopAt);
    if (from < frames) {
      const startTime = currentTime + from / sampleRate;
      if (!this.player) {
        const song = songs.get(this.id);
        if (song) {
          this.player = new SongRenderer(
            song,
            sampleRate,
            positionAt(transition, startTime),
            this.stretchBelow,
          );
        }
      }
      if (this.player && from < to) {
        // The block's average rate lands it exactly where the model is at its
        // end, so consecutive blocks join without a seam.
        const start = positionAt(transition, startTime);
        const end = positionAt(transition, currentTime + to / sampleRate);
        const rate = (end - start) / ((to - from) / sampleRate);
        this.player.render(output, from, to, rate, start);
      }
    }
    if (to < frames || this.player?.ended) {
      this.finish();
      return false;
    }
    return true;
  }
}

registerProcessor(STRETCH_STORE_PROCESSOR, StretchStoreProcessor);
registerProcessor(STRETCH_VOICE_PROCESSOR, SongVoiceProcessor);
