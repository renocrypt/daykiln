// The site's sound (LOOK.md, Sound). One AudioContext for the site, made or woken by the visitor's
// own gesture, as browsers require; on unless the visitor has turned it off, a choice remembered
// across the three pieces and later visits.
//
// Sound is the third clock (SCORE.md, rule 9). The frame loop tells it each frame's time with
// `frame(now)`; an event found in the frame's stretch of simulation is scheduled with `at(u)`, u its
// place in that stretch, 0…1, so that it is heard when the frame that shows it is seen. The mapping
// from the page's clock to the context's is read from the output itself (`getOutputTimestamp`) and
// smoothed; Web Audio never counts its own beats.
//
// Muting fades the master, then clears every processor, so nothing stale rings when sound returns,
// then suspends the context. A hidden page does the same, without changing the visitor's choice.

import voices from './voices.worklet.ts?worker&url';

export type ProcessorName = 'modal' | 'meter';

const KEY = 'yaobian.sound';
const FADE = 0.08; // s

/** The loudest sample of each 20 ms window, the last 300 ms's RMS, and how often the clip acted. */
export type Levels = { peaks: number[]; rms: number; clipped: number };

function createSound() {
  let context: AudioContext | null = null;
  let loaded: Promise<void> | null = null;
  let master: GainNode | null = null;
  let on = localStorage.getItem(KEY) !== 'off';
  let hidden = document.visibilityState === 'hidden';
  const nodes = new Set<AudioWorkletNode>();
  const loads = new Map<AudioWorkletNode, number>();
  const listeners = new Set<() => void>();
  const levels: Levels = { peaks: [], rms: 0, clipped: 0 };
  let heard = 0; // performance.now() when a peak above silence last arrived
  // The page's clock to the context's: context time = offset + page time / 1000, from the output.
  let offset = Number.NaN;
  let interval = 1000 / 60; // ms, the frame interval, smoothed
  let delay = 2 * interval; // ms from a moment of the simulation to its hearing: two frames, held steady
  let last = 0;
  let base = 0; // context time at which this frame's stretch begins to be heard
  let span = 0; // s over which it is heard
  let lag = 0; // s the whole stretch is moved on, when the output cannot be reached as early as the frame is seen
  let give = 0; // s of lag let go this frame: its stretch is heard that much shorter
  // Each quieting (off, hidden, idle) and each waking takes the next number; a quieting finishes, its
  // voices reset and the context suspended, only if nothing has woken the sound since it began.
  let epoch = 0;

  const changed = () => { for (const l of listeners) l(); };
  const watch = (node: AudioWorkletNode) => {
    nodes.add(node);
    node.port.onmessage = (event: MessageEvent<{ type: string; load?: number } & Partial<Levels>>) => {
      const m = event.data;
      if (m.type === 'load') loads.set(node, m.load ?? 0);
      else if (m.type === 'peaks') {
        levels.peaks.push(...(m.peaks ?? []));
        if (levels.peaks.length > 120) levels.peaks.splice(0, levels.peaks.length - 120);
        levels.rms = m.rms ?? 0;
        levels.clipped += m.clipped ?? 0;
        if ((m.peaks ?? []).some((p) => p > 1e-4)) heard = performance.now();
      }
    };
  };

  /** The master: every piece's sound, a gentle compressor, then the meter's soft clip, then out. */
  function build(ctx: AudioContext): void {
    master = ctx.createGain();
    master.gain.value = on && !hidden ? 1 : 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.knee.value = 6;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    const meter = new AudioWorkletNode(ctx, 'meter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    watch(meter);
    master.connect(compressor).connect(meter).connect(ctx.destination);
  }

  /** Quiet everything, forget every voice, and stop the context: nothing stale rings on return. */
  function silence(): void {
    if (!context || !master) return;
    master.gain.setTargetAtTime(0, context.currentTime, FADE / 3);
    const ctx = context, mine = ++epoch;
    window.setTimeout(() => {
      if (mine !== epoch) return; // woken meanwhile
      for (const node of nodes) node.port.postMessage({ type: 'reset' });
      void ctx.suspend();
    }, FADE * 1000 * 1.5);
  }
  function wake(): void {
    if (!context || !master || !on || hidden) return;
    epoch++; // any quieting still under way stops here
    void context.resume();
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(1, context.currentTime, FADE / 3);
  }

  document.addEventListener('visibilitychange', () => {
    hidden = document.visibilityState === 'hidden';
    if (hidden) silence(); else wake();
  });

  return {
    /** The visitor's choice. */
    get on(): boolean { return on; },
    /** Whether sound is being made now. */
    get running(): boolean { return !!context && context.state === 'running' && on && !hidden; },
    get context(): AudioContext | null { return context; },
    /** Where a piece connects its sound. Null until the processors have loaded. */
    get input(): GainNode | null { return master; },
    /** The latest levels at the end of the chain, for the sound mark. */
    get levels(): Levels { return levels; },
    /** Whether anything above silence has been heard in the last `ms`. */
    heardWithin(ms: number): boolean { return performance.now() - heard < ms; },
    /** The share of one core the audio thread spends in these processors, summed. */
    get load(): number { let sum = 0; for (const l of loads.values()) sum += l; return sum; },
    onChange(listen: () => void): () => void { listeners.add(listen); return () => listeners.delete(listen); },

    /** Warm the HTTP cache with the processors' module, so loading it after the gesture is quick. */
    prefetch(): void { void fetch(voices).catch(() => {}); },

    /**
     * Inside a gesture's handler, synchronously: make or wake the context, if sound is on. Resolves
     * when the processors are loaded and `input` exists.
     */
    begin(): Promise<void> | null {
      if (!on) return null;
      if (!context) {
        context = new AudioContext({ latencyHint: 'interactive' });
        const ctx = context;
        loaded = ctx.audioWorklet.addModule(voices).then(() => { build(ctx); changed(); });
      }
      wake();
      changed();
      return loaded;
    },

    /** The visitor turns sound on or off: the mark, or M. Call inside the gesture's handler. */
    toggle(): void {
      on = !on;
      localStorage.setItem(KEY, on ? 'on' : 'off');
      if (on) { if (context) wake(); else void this.begin(); }
      else silence();
      changed();
    },

    /** A processor, connected by the caller. Null if sound has not begun or is not loaded. */
    async processor(name: Exclude<ProcessorName, 'meter'>, options: AudioWorkletNodeOptions = {}): Promise<AudioWorkletNode | null> {
      if (!context || !loaded) return null;
      await loaded;
      const node = new AudioWorkletNode(context, name, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [name === 'modal' ? 1 : 2], ...options });
      watch(node);
      return node;
    },
    /** Let a processor go: it stops at its next block and is collected. */
    release(node: AudioWorkletNode): void {
      node.port.postMessage({ type: 'end' });
      node.disconnect();
      nodes.delete(node);
      loads.delete(node);
    },
    /** Send timed events to a processor. With no processor yet, they are dropped: late sound is worse than none. */
    send(node: AudioWorkletNode | null, events: { time: number; [key: string]: unknown }[]): void {
      if (node) node.port.postMessage({ type: 'events', events });
    },
    /** Set a processor's parameters. */
    set(node: AudioWorkletNode | null, message: { type: string; [key: string]: unknown }): void {
      node?.port.postMessage(message);
    },

    /** Once a frame, from the frame loop, with its timestamp: the page's clock against the output's. */
    frame(now: number): void {
      const step = last ? Math.min(50, now - last) : interval; // ms since the last frame: this frame's stretch
      if (last) interval += (step - interval) * 0.1;
      delay += (2 * interval - delay) * 0.01;
      const from = now - step; // page time at the stretch's start
      last = now;
      if (!context || context.state !== 'running') return;
      const stamp = context.getOutputTimestamp();
      if (stamp.performanceTime && stamp.contextTime !== undefined) {
        const o = stamp.contextTime - stamp.performanceTime / 1000;
        offset = Number.isNaN(offset) || Math.abs(o - offset) > 0.1 ? o : offset + (o - offset) * 0.05;
      }
      // Each moment of the frame's stretch is heard a steady delay after the page time it stands for:
      // two frames, so an event is heard no sooner than the frame that shows it is seen, and within a
      // frame of it. So one frame's stretch ends where the next begins, and events keep their spacing
      // across frames as within them. When the output cannot be reached that early (its latency is
      // longer), every moment moves on together, by a lag that then holds, a few ms more than needed,
      // so the output's own steps (128 samples, 2.7 ms) do not move it again. When the output can be
      // reached more than 12 ms earlier, the lag is let go at 5 % of the time passing: meanwhile each
      // stretch is heard 5 % shorter, so none runs into the next.
      const raw = Number.isNaN(offset) ? context.currentTime + context.baseLatency : offset + (from + delay) / 1000;
      const earliest = context.currentTime + (2 * 128) / context.sampleRate;
      const need = Math.max(earliest - raw, 0);
      give = 0;
      if (need > lag) lag = need + 0.004;
      else if (lag - need > 0.012) { give = Math.min(lag - need - 0.012, (0.05 * step) / 1000); lag -= give; }
      base = raw + lag;
      span = step / 1000 - give;
    },
    /**
     * The context time at which an event `u` of the way through this frame's stretch of simulation is
     * heard: the moment it stands for, a steady delay on, and as much later as the output forces.
     */
    at(u = 0): number {
      if (!context) return 0;
      return base + u * span;
    },
    /** How far behind the picture the sound is, s: the lag the output forces. */
    get lag(): number { return lag; },
    /** Leaving a piece: the audio suspended, the visitor's choice kept; the next Begin wakes it. */
    idle(): void {
      if (!context || context.state !== 'running') return;
      silence();
    },

    /**
     * Render offline with the same processors: for tests and for keeping a sound as a file. `build`
     * wires processors from `make` into `out` and schedules their events.
     */
    async render(seconds: number, build: (make: (name: ProcessorName, options?: AudioWorkletNodeOptions) => AudioWorkletNode, out: AudioNode, ctx: OfflineAudioContext) => void | Promise<void>, rate = 48000): Promise<AudioBuffer> {
      const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
      await ctx.audioWorklet.addModule(voices);
      const make = (name: ProcessorName, options: AudioWorkletNodeOptions = {}) => new AudioWorkletNode(ctx, name, { numberOfInputs: name === 'meter' ? 1 : 0, numberOfOutputs: 1, outputChannelCount: [name === 'modal' ? 1 : 2], ...options });
      await build(make, ctx.destination, ctx);
      return ctx.startRendering();
    },
  };
}

export const sound = createSound();
export type Sound = typeof sound;

/** An AudioBuffer as a 16-bit PCM WAV file. */
export function wav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels, frames = buffer.length, rate = buffer.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + frames * channels * 2));
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); data.setUint32(4, 36 + frames * channels * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, channels, true);
  data.setUint32(24, rate, true); data.setUint32(28, rate * channels * 2, true); data.setUint16(32, channels * 2, true); data.setUint16(34, 16, true);
  text(36, 'data'); data.setUint32(40, frames * channels * 2, true);
  const planes = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let at = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
    const v = Math.max(-1, Math.min(1, planes[c][i]));
    data.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    at += 2;
  }
  return new Blob([data.buffer], { type: 'audio/wav' });
}
