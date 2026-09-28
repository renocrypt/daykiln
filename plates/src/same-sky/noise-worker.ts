// Generates SAME SKY's noise off the main thread (noise.ts).

import { noiseData } from './noise.ts';

const data = noiseData();
postMessage(data, { transfer: [data.billows.data.buffer, data.patches.data.buffer, data.detail.data.buffer, data.pile.data.buffer] });
