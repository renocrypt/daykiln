// Runs Yaobian's AudioWorklet processors (src/core/voices.worklet.ts) in Node, block by block, from
// the module itself, so what is measured offline is the code the pages run.

const RATE = 48000, BLOCK = 128;
type Processor = { process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean };
type Message = { type: string; [key: string]: unknown };
const registry: Record<string, new (options: { processorOptions: { messages: Message[] } }) => Processor> = {};
const scope = globalThis as unknown as Record<string, unknown>;
scope.sampleRate = RATE;
scope.currentTime = 0;
scope.AudioWorkletProcessor = class { port = { onmessage: null, postMessage() {} }; };
scope.registerProcessor = (name: string, processor: (typeof registry)[string]) => { registry[name] = processor; };
await import('../src/core/voices.worklet.ts');

/** `seconds` of processor `name`, given its first messages, fed by `input` (channels) if any. */
export function render(name: string, messages: Message[], seconds: number, input: Float32Array[] | null = null, channels = 2): Float32Array[] {
  const p = new registry[name]({ processorOptions: { messages } });
  const frames = Math.ceil((seconds * RATE) / BLOCK) * BLOCK;
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let at = 0; at < frames; at += BLOCK) {
    scope.currentTime = at / RATE;
    const block = Array.from({ length: channels }, () => new Float32Array(BLOCK));
    p.process(input ? [input.map((c) => c.subarray(at, at + BLOCK))] : [[]], [block]);
    block.forEach((b, c) => out[c].set(b, at));
  }
  return out;
}
