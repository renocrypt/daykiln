// The processors Yaobian's sound is made by, on the audio thread. Each is a small physical model,
// driven by messages from the frame loop; an event carries the context time at which it is to be
// heard, and is placed at its sample. One that reaches the thread more than 30 ms late is dropped,
// not played late. Each processor skips its work while silent, forgets everything on `reset`, and
// reports once a second how much of the audio thread it used.
//
//   modal    a bank of damped resonators, an object's modes, struck (KILN's bowl)
//   meter    the end of the chain: a soft clip that never lets a sample past ±1, and the peaks the
//            sound mark draws
//
// The module imports nothing: an AudioWorklet module stands alone.

declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(name: string, processor: new (options?: { processorOptions?: { messages?: { type: string }[] } }) => AudioWorkletProcessor): void;

const LATE = 0.03; // s
const TAU = Math.PI * 2;
const clock = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();

type Message = { type: string; [key: string]: unknown };
type Timed = { time: number; [key: string]: unknown };

/** White noise, xorshift32: deterministic from its seed, so an offline render repeats a live one. */
function noise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 2147483648 - 1;
  };
}

/**
 * A processor that places timed events at their sample, forgets on reset, and reports its cost. Its
 * first messages may come with it, as `processorOptions.messages`: an offline render starts before a
 * port's messages are delivered, and a kept recording must hear everything it was sent.
 */
abstract class Voice extends AudioWorkletProcessor {
  private events: Timed[] = [];
  private inbox: Message[];
  private spent = 0; // ms in process() since the last report
  private rendered = 0; // frames since the last report
  private ended = false;
  constructor(options?: { processorOptions?: { messages?: Message[] } }) {
    super();
    this.inbox = [...(options?.processorOptions?.messages ?? [])];
    // Handled at the next block, never here: a subclass's fields are not yet set while this runs.
    this.port.onmessage = (message: MessageEvent<Message>) => { this.inbox.push(message.data); };
  }
  private receive(m: Message): void {
    if (m.type === 'reset') { this.events = []; this.clear(); }
    else if (m.type === 'end') this.ended = true;
    else if (m.type === 'events') {
      for (const e of m.events as Timed[]) this.events.push(e);
      this.events.sort((a, b) => a.time - b.time);
    } else this.configure(m);
  }
  /** Forget every sounding voice and state. */
  protected abstract clear(): void;
  protected configure(_m: Message): void {}
  /** An event, at the frame it falls on. */
  protected abstract apply(e: Timed): void;
  /** Frames [from, to) of this block. */
  protected abstract render(inputs: Float32Array[][], outputs: Float32Array[][], from: number, to: number): void;

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.inbox.length) { const inbox = this.inbox; this.inbox = []; for (const m of inbox) this.receive(m); }
    if (this.ended) return false;
    const started = clock();
    const frames = outputs[0][0].length;
    let from = 0;
    while (this.events.length) {
      const at = Math.round((this.events[0].time - currentTime) * sampleRate);
      if (at >= frames) break;
      const e = this.events.shift()!;
      if (at < -LATE * sampleRate) continue; // too late to be heard with what it belongs to
      if (at > from) { this.render(inputs, outputs, from, at); from = at; }
      this.apply(e);
    }
    if (from < frames) this.render(inputs, outputs, from, frames);
    this.spent += clock() - started;
    this.rendered += frames;
    if (this.rendered >= sampleRate) {
      this.port.postMessage({ type: 'load', load: this.spent / 1000 / (this.rendered / sampleRate) });
      this.spent = 0;
      this.rendered = 0;
    }
    return true;
  }
}

// modal -----------------------------------------------------------------------------------------------

/**
 * An object's modes as complex one-pole resonators, z ← z·p + x, heard as Im z: a strike adds to the
 * real part, so each mode starts from rest as a sine, with no click. Configure with
 * `{ type: 'modes', frequencies, dampings, gains }` (Hz, damping ratio ζ, output gain); strike with
 * events `{ time, amplitudes: number[], snap?: number }`, where `snap` adds the fracture's own
 * crack: 0.3 ms of high-passed noise.
 */
class Modal extends Voice {
  private cr = new Float64Array(0); // the pole, r cos θ
  private ci = new Float64Array(0); // the pole, r sin θ
  private re = new Float64Array(0);
  private im = new Float64Array(0);
  private gains = new Float64Array(0);
  private energy = 0;
  private snap = 0;
  private readonly snapKeep = Math.exp(-1 / (0.0003 * sampleRate));
  private readonly hpKeep = Math.exp((-TAU * 2000) / sampleRate);
  private hp = 0;
  private last = 0;
  private readonly white = noise(0x9e3779b9);

  private frequencies: number[] = [];
  private damping = new Float64Array(0); // each mode's, now
  private dampingTo = new Float64Array(0); // and where it glides, over about 50 ms
  private gliding = false;
  protected configure(m: Message): void {
    if (m.type === 'damp') { // the loss changed: what rings keeps ringing, its decay gliding to the new
      (m.dampings as number[]).forEach((d, k) => { if (k < this.dampingTo.length && Number.isFinite(d)) this.dampingTo[k] = d; });
      this.gliding = true;
      return;
    }
    if (m.type !== 'modes') return;
    const f = m.frequencies as number[], n = f.length;
    this.frequencies = f;
    this.cr = new Float64Array(n); this.ci = new Float64Array(n);
    this.re = new Float64Array(n); this.im = new Float64Array(n);
    this.gains = Float64Array.from(m.gains as number[]);
    this.damping = Float64Array.from(m.dampings as number[]);
    this.dampingTo = Float64Array.from(this.damping);
    this.gliding = false;
    this.tune(this.damping);
  }
  private tune(dampings: ArrayLike<number>): void {
    for (let k = 0; k < this.frequencies.length; k++) {
      const f = this.frequencies[k], w = (TAU * f) / sampleRate;
      if (f >= sampleRate / 2 || !Number.isFinite(dampings[k])) { this.cr[k] = this.ci[k] = 0; continue; } // above what this rate can carry: silent
      const r = Math.exp(-dampings[k] * w);
      this.cr[k] = r * Math.cos(w);
      this.ci[k] = r * Math.sin(w);
    }
  }
  protected clear(): void { this.re.fill(0); this.im.fill(0); this.energy = 0; this.snap = 0; }
  protected apply(e: Timed): void {
    const a = e.amplitudes as number[];
    for (let k = 0; k < this.re.length; k++) { const v = a[k] ?? 0; if (Number.isFinite(v)) this.re[k] += v; } // a bad strike must not latch a resonator
    const snap = (e.snap as number | undefined) ?? 0;
    if (Number.isFinite(snap)) this.snap += snap;
    this.energy = 1;
  }
  protected render(_inputs: Float32Array[][], outputs: Float32Array[][], from: number, to: number): void {
    const out = outputs[0][0];
    if (this.gliding) {
      let still = true;
      const g = 1 - Math.exp(-(to - from) / (0.05 * sampleRate));
      for (let k = 0; k < this.damping.length; k++) {
        this.damping[k] += (this.dampingTo[k] - this.damping[k]) * g;
        if (Math.abs(this.dampingTo[k] - this.damping[k]) > 1e-9) still = false; else this.damping[k] = this.dampingTo[k];
      }
      this.tune(this.damping);
      this.gliding = !still;
    }
    if (this.energy < 1e-14 && this.snap < 1e-7) { out.fill(0, from, to); return; }
    const { cr, ci, re, im, gains } = this;
    const n = re.length;
    for (let i = from; i < to; i++) {
      let y = 0;
      for (let k = 0; k < n; k++) {
        const r = re[k], m = im[k];
        re[k] = r * cr[k] - m * ci[k];
        im[k] = r * ci[k] + m * cr[k];
        y += im[k] * gains[k];
      }
      if (this.snap > 1e-7) {
        const x = this.white();
        this.hp = this.hpKeep * (this.hp + x - this.last);
        this.last = x;
        y += this.hp * this.snap;
        this.snap *= this.snapKeep;
      }
      out[i] = y;
    }
    let energy = 0;
    for (let k = 0; k < n; k++) energy += re[k] * re[k] + im[k] * im[k];
    if (!Number.isFinite(energy)) { this.clear(); energy = 0; }
    this.energy = energy;
  }
}

// meter -----------------------------------------------------------------------------------------------

const KNEE = 0.891; // −1 dBFS

/**
 * The end of the chain. Passes its input through a soft clip: linear to −1 dBFS, then a tanh knee
 * that never reaches ±1, since a compressor alone is not a limiter. Keeps the loudest sample of
 * every 20 ms window before the clip, and posts them about thirty times a second with the RMS of the
 * last 300 ms and how many samples the clip touched.
 */
class Meter extends Voice {
  private readonly window = Math.round(0.02 * sampleRate);
  private filled = 0;
  private peak = 0;
  private peaks: number[] = [];
  private square = 0;
  private readonly rmsKeep = Math.exp(-1 / (0.3 * sampleRate));
  private clipped = 0;
  private since = 0;
  protected clear(): void { this.peak = 0; this.peaks = []; this.square = 0; }
  protected apply(_e: Timed): void {}
  protected render(inputs: Float32Array[][], outputs: Float32Array[][], from: number, to: number): void {
    const input = inputs[0] ?? [];
    const out = outputs[0];
    for (let c = 0; c < out.length; c++) {
      const x = input[c] ?? input[0];
      for (let i = from; i < to; i++) {
        let v = x ? x[i] : 0;
        if (!Number.isFinite(v)) v = 0; // one bad sample upstream must not silence everything after it
        const a = Math.abs(v);
        if (a > this.peak) this.peak = a;
        if (c === 0) this.square = this.square * this.rmsKeep + v * v * (1 - this.rmsKeep);
        if (a > KNEE) {
          v = Math.sign(v) * (KNEE + (1 - KNEE) * Math.tanh((a - KNEE) / (1 - KNEE)));
          this.clipped++;
        }
        out[c][i] = v;
      }
    }
    this.filled += to - from;
    this.since += to - from;
    if (this.filled >= this.window) { this.peaks.push(this.peak); this.peak = 0; this.filled = 0; }
    if (this.since >= sampleRate / 30) {
      this.port.postMessage({ type: 'peaks', peaks: this.peaks, rms: Math.sqrt(this.square), clipped: this.clipped });
      this.peaks = [];
      this.clipped = 0;
      this.since = 0;
    }
  }
}

registerProcessor('modal', Modal);
registerProcessor('meter', Meter);

export {};
