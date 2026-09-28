// Yaobian's page: its three pieces, each at its own address, each loaded only when it is opened.
// The series has no page of its own: the album's door is its way in, so any other address goes there.

import './app.css';

const stage = document.querySelector<HTMLElement>('#stage')!;

const PIECES: Record<string, () => Promise<{ mount(root: HTMLElement): Promise<() => void> }>> = {
  '/yaobian/kiln': () => import('../pieces/kiln.ts'),
  '/yaobian/rule': () => import('../pieces/rule.ts'),
  '/yaobian/plumb': () => import('../pieces/plumb.ts'),
};

const load = PIECES[location.pathname.replace(/\/$/, '')];
if (load) void load().then((piece) => piece.mount(stage));
else location.replace('/');
