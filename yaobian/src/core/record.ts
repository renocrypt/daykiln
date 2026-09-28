// The kept-result card (LOOK.md, invariants): the artifact, one caption line, the series mark.
// The artifact is drawn by the piece; the card draws it again on its paper, line by line in the
// order the piece gives (`data-draw`), and lets the visitor keep it.

import { animate, svg } from 'animejs';
import { reducedMotion } from './score.ts';

export function showRecord(root: HTMLElement, o: { svg: string; filename: string; extras?: { label: string; run: () => void }[] }): void {
  const card = document.createElement('div');
  card.className = 'record';
  card.innerHTML = `<div class="sheet">${o.svg}</div><p class="actions"><button type="button" class="save">Keep  ↓</button>${(o.extras ?? []).map((_e, i) => `<button type="button" class="extra" data-i="${i}"></button>`).join('')}<button type="button" class="close">Close <kbd>esc</kbd></button></p>`;
  card.querySelectorAll<HTMLButtonElement>('.extra').forEach((b) => { const e = o.extras![Number(b.dataset.i)]; b.textContent = e.label; b.addEventListener('click', e.run); });
  root.append(card);
  root.classList.add('keeping'); // the piece's own labels step aside while the card is up
  requestAnimationFrame(() => card.classList.add('on'));
  // Draw it: every marked line in its order, over about four seconds.
  const lines = [...card.querySelectorAll<SVGGeometryElement>('[data-draw]')].sort((a, b) => Number(a.dataset.draw) - Number(b.dataset.draw));
  if (lines.length && !reducedMotion) {
    const order = lines.map((l) => Number(l.dataset.draw));
    const lo = Math.min(...order), hi = Math.max(...order);
    const drawables = svg.createDrawable(lines);
    animate(drawables, {
      draw: ['0 0', '0 1'],
      delay: (_target?: unknown, i = 0) => 300 + ((order[i] - lo) / Math.max(1, hi - lo)) * 3600,
      duration: (_target?: unknown, i = 0) => (order[i] < 0 ? 4000 : 700),
      ease: 'outQuad',
    });
  }
  const close = () => { card.classList.remove('on'); root.classList.remove('keeping'); removeEventListener('keydown', key); setTimeout(() => card.remove(), 500); };
  const key = (e: KeyboardEvent) => { if (e.code === 'Escape') close(); };
  addEventListener('keydown', key);
  card.querySelector('.close')!.addEventListener('click', close);
  card.querySelector('.save')!.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([o.svg], { type: 'image/svg+xml' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: o.filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
