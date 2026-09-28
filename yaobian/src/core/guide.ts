// A piece's guide, shared by the three: what the piece is, where the visitor is in its ritual, what
// to do now, and what is happening. Written for a visitor who has never seen the piece; spare, not
// bare: every word is information.
//
//   - A prologue the visitor scrolls: the piece's name, then a few short chapters of what it is,
//     while the scene turns under them (the piece reads `progress`), then the steps and a way in.
//   - Then a step line across the top, one sentence of what to do or what is happening at the
//     bottom, the actions open now, each with its key, a log of what the process is doing, and the
//     piece's own instrument where it has one.
//   - A way back to the album's door, always; and, for a piece that sounds, mirroring it at the upper
//     right, the sound's mark: one hairline that swells with the sound, a click or M to turn it off.
// Motion is Anime.js: letters and words set in as they arrive, notes enter the log as they happen.

import { animate, spring, splitText, stagger } from 'animejs';
import { reducedMotion } from './score.ts';
import { sound } from './sound.ts';

export type Action = { label: string; key: string; run: () => void; primary?: boolean };
export type Chapter = { kicker?: string; text: string[] };

/**
 * How the piece's name arrives, in the manner of its process:
 *   cool       out of the dark as hot metal does, dull red, then warm, then the paper's colour; the
 *              ends first, as an object's edges lose their heat before its middle;
 *   construct  a hairline rule drawn out from the middle, then the capitals set on it at once, one
 *              by one, symmetrically from the middle out;
 *   settle     each letter drops and comes to rest as a weight does, the heaviest first.
 */
export type TitleEntrance = 'cool' | 'construct' | 'settle';

export type GuideOptions = {
  name: string;
  maker: string; // "Drawn by the fire."
  chapters: Chapter[];
  steps: string[];
  poster?: string; // the piece's frame, shown while the scene loads
  entrance: TitleEntrance;
  sound?: boolean; // the piece makes sound: only KILN
};

const ease = 'outExpo';

export function guide(root: HTMLElement, o: GuideOptions) {
  const layer = document.createElement('div');
  layer.className = `guide ${o.name.toLowerCase()}`; // the piece's own title face
  const stepList = (cls: string) => `<ol class="${cls}">${o.steps.map((s, i) => `<li><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="s">${s}</span></li>`).join('')}</ol>`;
  layer.innerHTML = `
    <div class="poster" ${o.poster ? `style="background-image:url(${o.poster})"` : ''}></div>
    <a class="back" href="/"><span>←</span> 照 Daykiln</a>
    ${o.sound ? `<button class="sound" type="button" aria-pressed="true" title="The sound this piece is making, synthesized from its simulation"><svg viewBox="0 -3 32 20" width="32" height="20" aria-hidden="true"><path d="M0 7Q16 7 32 7"/><path d="M0 7Q16 7 32 7"/></svg><span class="state">Sound</span><kbd>M</kbd></button>` : ''}
    <div class="prologue">
      <section class="hero">
        <h1>${o.name}</h1>${o.entrance === 'construct' ? '<i class="rule-line"></i>' : ''}
        <p class="maker">${o.maker}</p>
        <p class="hint"><span class="label">Preparing…</span></p>
      </section>
      ${o.chapters.map((c, i) => `<section class="chapter"><div class="copy">${c.kicker ? `<p class="kicker">${String(i + 1).padStart(2, '0')} · ${c.kicker}</p>` : ''}${c.text.map((t) => `<p>${t}</p>`).join('')}</div></section>`).join('')}
      <section class="way-in"><div class="copy">${stepList('preview')}<button type="button" class="begin" disabled>Begin <kbd>↵</kbd></button></div></section>
    </div>
    ${stepList('steps')}
    <ol class="log"></ol>
    <div class="instrument" hidden></div>
    <div class="bottom">
      <p class="say"></p>
      <div class="meter" hidden><div class="track"><span class="fill"></span></div><div class="marks"></div><p class="value"></p></div>
      <div class="actions"></div>
    </div>`;
  root.append(layer);
  const $ = <T extends Element>(s: string) => layer.querySelector<T>(s)!;
  const prologue = $<HTMLElement>('.prologue'), begin = $<HTMLButtonElement>('.begin');
  let onBegin: (() => void) | null = null;
  let actions: Action[] = [];
  let progress = 0;
  const listeners = new Set<(p: number) => void>();

  // The name arrives in its piece's manner; each chapter's words set in as it scrolls into view.
  const quick = reducedMotion ? 0 : 1;
  const chars = splitText($<HTMLElement>('.hero h1'), { chars: true }).chars as HTMLElement[];
  const middle = (chars.length - 1) / 2;
  const fromMiddle = (i: number) => Math.abs(i - middle);
  let settled = 900; // ms until the name has arrived, for the maker's line
  if (!reducedMotion) for (const c of chars) c.style.opacity = '0'; // unseen until its turn
  if (o.entrance === 'cool') {
    // The ends first: they are nearest the air.
    const order = (i: number) => (middle - fromMiddle(i)) * 260;
    animate(chars, { opacity: [0, 1], duration: 500 * quick, delay: (_t?: unknown, i = 0) => (300 + order(i)) * quick, ease: 'outQuad' });
    animate(chars, { color: ['rgb(96, 24, 8)', 'rgb(214, 96, 36)', 'rgb(236, 190, 140)', 'rgb(241, 236, 226)'], duration: 2800 * quick, delay: (_t?: unknown, i = 0) => (300 + order(i)) * quick, ease: 'outSine' });
    settled = 1800;
  } else if (o.entrance === 'construct') {
    // The line first, from the middle; then each capital, at once, from the middle out.
    animate($<HTMLElement>('.hero .rule-line'), { scaleX: [0, 1], opacity: [1, 0.4], duration: 700 * quick, delay: 200 * quick, ease: 'inOutQuad' });
    animate(chars, { opacity: [0, 1], duration: 1, delay: (_t?: unknown, i = 0) => (900 + Math.floor(fromMiddle(i)) * 150) * quick });
    settled = 1300;
  } else {
    // By weight: the letter with the most ink drops first.
    const mass = chars.map((c) => c.getBoundingClientRect().width);
    const rank = mass.map((m, i) => ({ m, i })).sort((a, b) => b.m - a.m).map((x) => x.i);
    // Dropped on a cord, it overshoots a little and settles, as the net does.
    const drop = spring({ stiffness: 170, damping: 17 });
    const at = (_t?: unknown, i = 0) => (200 + rank.indexOf(i) * 140) * quick;
    animate(chars, { translateY: ['-0.4em', '0em'], ease: reducedMotion ? 'linear' : drop, ...(reducedMotion ? { duration: 0 } : {}), delay: at });
    animate(chars, { opacity: [0, 1], duration: 260 * quick, ease: 'outQuad', delay: at });
    settled = 1400;
  }
  animate($<HTMLElement>('.hero .maker'), { opacity: [0, 0.8], translateY: ['0.6em', '0em'], delay: settled * quick, duration: 1200 * quick, ease });
  // Words are split for their entrance; the way in is not, since splitting rebuilds the elements.
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      seen.unobserve(e.target);
      const el = e.target as HTMLElement;
      const parts = el.closest('.way-in') ? [...el.querySelectorAll('li, .begin')] : splitText(el, { words: true }).words;
      animate(parts, { opacity: [0, 1], translateY: ['0.5em', '0em'], delay: stagger(el.closest('.way-in') ? 90 * quick : 14 * quick), duration: 900 * quick, ease });
    }
  }, { root: prologue, threshold: 0.35 });
  prologue.querySelectorAll('.chapter .copy, .way-in .copy').forEach((el) => seen.observe(el));
  prologue.addEventListener('scroll', () => {
    progress = prologue.scrollTop / Math.max(1, prologue.scrollHeight - prologue.clientHeight);
    for (const l of listeners) l(progress);
  }, { passive: true });

  const start = () => {
    if (begin.disabled || !onBegin) return;
    if (o.sound) void sound.begin(); // inside the visitor's gesture, as browsers require
    animate(prologue, { opacity: 0, duration: 700 * quick, ease: 'inOutSine', onComplete: () => prologue.remove() });
    layer.classList.add('begun');
    animate(layer.querySelectorAll('.steps li'), { opacity: [0, 1], translateY: ['-0.6em', '0em'], delay: stagger(90 * quick, { start: 300 * quick }), duration: 900 * quick, ease });
    const then = onBegin;
    onBegin = null;
    then();
  };
  layer.addEventListener('click', (event) => { if ((event.target as HTMLElement).closest('.begin')) start(); });
  const keys = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (o.sound && event.code === 'KeyM' && !event.repeat) { sound.toggle(); event.preventDefault(); return; }
    if (onBegin && event.code === 'Enter') { start(); event.preventDefault(); event.stopImmediatePropagation(); return; }
    const action = actions.find((a) => a.key === event.code);
    if (action) { action.run(); event.preventDefault(); event.stopImmediatePropagation(); }
  };
  addEventListener('keydown', keys, true);
  // Back at the door, the album opens on this piece's leaf and lays its picture back in the window.
  $<HTMLAnchorElement>('.back').addEventListener('click', () => {
    try { sessionStorage.setItem('daykiln:return', o.name.toLowerCase()); } catch { /* it opens at its head */ }
  });

  // The sound's mark: a hairline that swells with the level at the end of the chain, calm when silent,
  // broken when off. It shows the sound the piece makes, not whether the speakers play it.
  const mark = layer.querySelector<HTMLButtonElement>('.sound') ?? document.createElement('button');
  const [upper, lower] = [...mark.querySelectorAll('path')];
  let swell = 0, drawn = -1, state = '', lastTick = 0, target = 0, heardAt = 0;
  const flat = () => { upper.setAttribute('d', 'M0 7Q16 7 32 7'); lower.setAttribute('d', 'M0 7Q16 7 32 7'); };
  const showState = () => {
    const now = sound.on ? 'on' : 'off';
    if (now === state) return;
    state = now;
    mark.classList.toggle('off', !sound.on);
    mark.setAttribute('aria-pressed', String(sound.on));
    mark.querySelector('.state')!.textContent = sound.on ? 'Sound' : 'Sound off';
    swell = 0; drawn = -1;
    if (sound.on) flat(); else { upper.setAttribute('d', 'M0 7H13M19 7H32'); lower.setAttribute('d', ''); }
    mark.style.removeProperty('--swell');
  };
  mark.addEventListener('click', () => sound.toggle());
  const unlisten = o.sound ? sound.onChange(showState) : () => {};
  if (o.sound) { showState(); sound.prefetch(); }

  const keyName = (code: string) => ({ Enter: '↵', Space: 'space', Escape: 'esc', Backspace: '⌫' } as Record<string, string>)[code] ?? code.replace(/^(Key|Digit)/, '');
  let said = '';

  return {
    /** Scroll progress through the prologue, 0 … 1, as it changes. */
    onProgress(listen: (p: number) => void): void { listeners.add(listen); },
    get progress(): number { return progress; },
    /** The scene is loading: what it is doing. */
    loading(text: string): void { $<HTMLElement>('.hero .hint .label').textContent = text; },
    /** The scene is ready: the way in opens; `then` runs when the visitor begins. */
    ready(then: () => void): void {
      onBegin = then;
      begin.disabled = false;
      $<HTMLElement>('.hero .hint .label').textContent = 'Scroll to read, or begin now  ↵';
      animate($<HTMLElement>('.poster'), { opacity: 0, duration: 1200 * quick, ease: 'inOutSine' });
    },
    /** Where the visitor is: a step's index. */
    step(i: number): void {
      layer.querySelectorAll('.steps li').forEach((li, k) => { li.classList.toggle('now', k === i); li.classList.toggle('done', k < i); });
    },
    /**
     * One sentence of what to do, or what is happening. A new sentence sets in word by word; `live`
     * updates the one showing, a number in it, without setting it in again.
     */
    say(text: string, live = false): void {
      if (text === said) return;
      said = text;
      const el = $<HTMLElement>('.say');
      el.textContent = text;
      if (!text || live) return;
      animate(splitText(el, { words: true }).words, { opacity: [0, 1], translateY: ['0.4em', '0em'], delay: stagger(22 * quick), duration: 700 * quick, ease });
    },
    /** The buttons open now. */
    actions(next: Action[]): void {
      const same = next.length === actions.length && next.every((a, i) => a.label === actions[i].label);
      actions = next;
      if (same) return;
      const box = $<HTMLElement>('.actions');
      box.replaceChildren(...next.map((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = a.primary ? 'primary' : '';
        b.innerHTML = `${a.label}<kbd>${keyName(a.key)}</kbd>`;
        b.addEventListener('click', a.run);
        return b;
      }));
      if (next.length) animate(box.children, { opacity: [0, 1], translateY: ['0.5em', '0em'], delay: stagger(80 * quick), duration: 700 * quick, ease });
    },
    /** A gauge: a value between marks, with a line of what it means; null hides it. */
    meter(value: number | null, g?: { max: number; marks: { at: number; label: string }[]; text: string }): void {
      const m = $<HTMLElement>('.meter');
      m.hidden = value === null || !g;
      if (value === null || !g) return;
      $<HTMLElement>('.meter .fill').style.width = `${Math.min(100, (value / g.max) * 100)}%`;
      const marks = $<HTMLElement>('.meter .marks');
      if (!marks.childElementCount) marks.innerHTML = g.marks.map((k) => `<i style="left:${(k.at / g.max) * 100}%"><b>${k.label}</b></i>`).join('');
      $<HTMLElement>('.meter .value').textContent = g.text;
    },
    /** A note in the log: what the process is doing, stamped. */
    note(stamp: string, text: string): void {
      const li = document.createElement('li');
      li.innerHTML = `<span class="stamp">${stamp}</span><span class="text">${text}</span>`;
      $<HTMLElement>('.log').append(li);
      animate(li, { opacity: [0, 1], translateX: ['-0.8em', '0em'], duration: 900 * quick, ease });
      animate(splitText(li.querySelector<HTMLElement>('.text')!, { words: true }).words, { opacity: [0, 1], delay: stagger(18 * quick, { start: 150 * quick }), duration: 600 * quick, ease: 'outQuad' });
    },
    clearNotes(): void { $<HTMLElement>('.log').replaceChildren(); },
    /** The piece's own instrument, at the lower left: shown, or withdrawn (null). */
    instrument(el: HTMLElement | null): void {
      const box = $<HTMLElement>('.instrument');
      if (el) {
        if (!box.contains(el)) box.replaceChildren(el);
        if (!box.hidden) return;
        box.hidden = false;
        animate(box, { opacity: [0, 1], translateY: ['0.8em', '0em'], duration: 900 * quick, ease });
      } else if (!box.hidden) {
        animate(box, { opacity: 0, duration: 600 * quick, ease: 'inOutSine', onComplete: () => { box.hidden = true; } });
      }
    },
    /** Show the log, or let it withdraw. */
    log(on: boolean): void { animate($<HTMLElement>('.log'), { opacity: on ? 1 : 0, duration: 900 * quick, ease: 'inOutSine' }); },
    /**
     * Once a frame, from the piece's own loop (there is no other): the sound's clock against the
     * page's, and the mark drawn to the level just made.
     */
    tick(now: number): void {
      if (!o.sound) return;
      sound.frame(now);
      const dt = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 0;
      lastTick = now;
      if (!sound.on) return;
      // The meter reports about thirty times a second: a frame with no report keeps the last level a
      // moment, rather than reading as silence. Rising in 30 ms, falling in 300, whatever the frame rate.
      const peaks = sound.levels.peaks.splice(0);
      if (peaks.length) { target = Math.min(1, Math.max(0, (20 * Math.log10(Math.max(...peaks) + 1e-9) + 60) / 60)); heardAt = now; }
      else if (now - heardAt > 100) target = 0;
      swell += (target - swell) * (1 - Math.exp(-dt / (target > swell ? 0.03 : 0.3)));
      if (Math.abs(swell - drawn) < 0.01) return;
      drawn = swell;
      if (reducedMotion) { mark.style.setProperty('--swell', swell.toFixed(2)); return; }
      const bulge = 3.5 * swell;
      upper.setAttribute('d', `M0 7Q16 ${(7 - 2 * bulge).toFixed(2)} 32 7`);
      lower.setAttribute('d', `M0 7Q16 ${(7 + 2 * bulge).toFixed(2)} 32 7`);
    },
    dispose(): void { removeEventListener('keydown', keys, true); seen.disconnect(); unlisten(); if (o.sound) sound.idle(); },
  };
}
