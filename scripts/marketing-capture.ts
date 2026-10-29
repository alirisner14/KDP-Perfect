/**
 * Captures marketing screenshots, screen recordings and 3D mockup images from the REAL desktop app.
 *
 *   npm run build && npx vite-node scripts/marketing-capture.ts [--only screenshots,mockups,videos]
 *
 * It launches Electron against dist/, drives the UI over the Chrome DevTools Protocol (clicks, typing, drags, with a
 * visible demo cursor), takes 2x PNG screenshots, records the page as a screencast and encodes it with ffmpeg
 * (MP4 + GIF). The artwork is generated procedurally and is entirely fictional. Output goes to marketing/ (git-ignored).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { computeCoverLayout, type CoverInput, type CoverLayout } from '../src/core';

const require = createRequire(import.meta.url);
const electronPath: string = require('electron');
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const outArg = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
const OUT = outArg ? resolve(outArg) : join(ROOT, 'marketing');
const DIRS = { shots: join(OUT, 'Screenshots'), videos: join(OUT, 'Videos'), mockups: join(OUT, 'Mockups'), exports: join(OUT, 'Exports') };
/** Where the app "saves" during capture. Neutral on purpose: the path shows in the "Saved ..." toast in the recordings. */
const DL = 'C:/Users/Public/Documents/KDP Perfect';
const PORT = 9444;
const only = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean);
const want = (k: string) => only.length === 0 || only.includes(k);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log('[capture]', ...a);

// ---------------------------------------------------------------------------------------------------------------------
// DevTools protocol client
// ---------------------------------------------------------------------------------------------------------------------

class CDP {
  private id = 0;
  private pending = new Map<number, (m: { result?: unknown; error?: { message: string } }) => void>();
  private handlers = new Map<string, ((p: any) => void)[]>();
  private constructor(private ws: WebSocket) {
    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data));
      if (msg.id && this.pending.has(msg.id)) this.pending.get(msg.id)!(msg);
      else if (msg.method) this.handlers.get(msg.method)?.forEach((h) => h(msg.params));
    };
  }
  static async connect(url: string): Promise<CDP> {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    return new CDP(ws);
  }
  send<T = any>(method: string, params: object = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const n = ++this.id;
      this.pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result as T)));
      this.ws.send(JSON.stringify({ id: n, method, params }));
    });
  }
  on(event: string, fn: (p: any) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
  }
  off(event: string) {
    this.handlers.delete(event);
  }
}

let cdp: CDP;
let electron: ChildProcess;
let cursor = { x: 760, y: 420 };

async function js<T = any>(expression: string): Promise<T> {
  const r = await cdp.send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}

async function waitFor(expression: string, ms = 20000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await js<boolean>(`!!(${expression})`)) return true;
    await sleep(250);
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------
// Demo interaction helpers (visible cursor + real input events)
// ---------------------------------------------------------------------------------------------------------------------

const CURSOR_JS = `(() => {
  if (document.getElementById('__cur')) return;
  const st = document.createElement('style');
  st.textContent = '::-webkit-scrollbar{display:none}html{scrollbar-width:none}#__cur{position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}' +
    '.__rip{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid rgba(79,70,229,.9);pointer-events:none;z-index:2147483646;animation:__rip .6s ease-out forwards}' +
    '@keyframes __rip{from{transform:scale(.4);opacity:1}to{transform:scale(3.4);opacity:0}}';
  document.head.append(st);
  const c = document.createElement('div'); c.id = '__cur';
  c.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2l15 9-6.5 1.6L9 19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.append(c);
})()`;

async function rectOf(selector: string): Promise<{ x: number; y: number; w: number; h: number }> {
  const r = await js<{ x: number; y: number; w: number; h: number } | null>(
    `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`,
  );
  if (!r) throw new Error(`No element for ${selector}`);
  return r;
}

async function moveTo(x: number, y: number, ms = 600): Promise<void> {
  await js(`(() => { const c = document.getElementById('__cur'); c.style.transition = 'transform ${ms}ms cubic-bezier(.25,.1,.2,1)'; c.style.transform = 'translate(${x - 4}px,${y - 2}px)'; })()`);
  // Real mouse-moved events so hover styles appear, stepped along the same path.
  const steps = Math.max(2, Math.round(ms / 60));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t * t * (3 - 2 * t);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cursor.x + (x - cursor.x) * e, y: cursor.y + (y - cursor.y) * e });
    await sleep(ms / steps);
  }
  cursor = { x, y };
}

async function click(selector: string, opts: { dx?: number; dy?: number; ms?: number } = {}): Promise<void> {
  await js(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'nearest' })`);
  await sleep(120);
  const r = await rectOf(selector);
  const x = r.x + r.w / 2 + (opts.dx ?? 0);
  const y = r.y + r.h / 2 + (opts.dy ?? 0);
  await moveTo(x, y, opts.ms ?? 600);
  await js(`(() => { const d = document.createElement('div'); d.className = '__rip'; d.style.left = '${x}px'; d.style.top = '${y}px'; document.body.append(d); setTimeout(() => d.remove(), 700); })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(70);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(350);
}

/** Move the demo cursor and show a click ripple WITHOUT sending a real click (a real click on a file drop-zone would open a native dialog). */
async function pretendClick(selector: string): Promise<void> {
  await js(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'nearest' })`);
  await sleep(120);
  const r = await rectOf(selector);
  const x = r.x + r.w / 2;
  const y = r.y + r.h / 2;
  await moveTo(x, y, 700);
  await js(`(() => { const d = document.createElement('div'); d.className = '__rip'; d.style.left = '${x}px'; d.style.top = '${y}px'; document.body.append(d); setTimeout(() => d.remove(), 700); })()`);
  await sleep(500);
}

async function typeInto(selector: string, text: string): Promise<void> {
  await click(selector);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
  for (const ch of text) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'char', text: ch, unmodifiedText: ch, key: ch });
    await sleep(140);
  }
  await sleep(500);
}

async function drag(from: { x: number; y: number }, to: { x: number; y: number }, ms = 1300): Promise<void> {
  await moveTo(from.x, from.y, 500);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
  const steps = 40;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t * t * (3 - 2 * t);
    const x = from.x + (to.x - from.x) * e;
    const y = from.y + (to.y - from.y) * e;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    await js(`(() => { const c = document.getElementById('__cur'); c.style.transition = 'none'; c.style.transform = 'translate(${x - 4}px,${y - 2}px)'; })()`);
    await sleep(ms / steps);
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
  cursor = to;
  await sleep(300);
}

async function scrollTo(selector: string, offset = -24, ms = 800): Promise<void> {
  await js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const y = e.getBoundingClientRect().top + window.scrollY + ${offset}; window.scrollTo({ top: y, behavior: 'smooth' }); })()`);
  await sleep(ms);
}

const setSelect = (selector: string, value: string) =>
  js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);

// ---------------------------------------------------------------------------------------------------------------------
// Artwork (procedural and fictional) and uploads
// ---------------------------------------------------------------------------------------------------------------------

interface ArtSpec {
  style: 'woodland' | 'garden';
  seed: number;
  S: number;
  canvas: { w: number; h: number };
  back: Rect;
  spine: Rect;
  front: Rect;
  barcode: Rect;
  sky: string[];
}
type Rect = { x: number; y: number; w: number; h: number };

const ART_JS = `(spec) => {
  const S = spec.S, W = spec.canvas.w, H = spec.canvas.h;
  const c = document.createElement('canvas'); c.width = Math.round(W * S); c.height = Math.round(H * S);
  const g = c.getContext('2d');
  let seed = spec.seed >>> 0;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const R = (r) => ({ x: r.x * S, y: r.y * S, w: r.w * S, h: r.h * S });
  const F = R(spec.front), B = R(spec.back), P = R(spec.spine), BC = R(spec.barcode);
  const sky = g.createLinearGradient(0, 0, 0, c.height);
  spec.sky.forEach((col, i, a) => sky.addColorStop(i / (a.length - 1), col));
  g.fillStyle = sky; g.fillRect(0, 0, c.width, c.height);
  const text = (t, x, y, size, color, opts = {}) => {
    g.save(); g.font = (opts.weight || 'bold') + ' ' + size + 'px ' + (opts.font || 'Georgia, serif');
    if (opts.maxW) { const m = g.measureText(t).width; if (m > opts.maxW) { size = size * opts.maxW / m; g.font = (opts.weight || 'bold') + ' ' + size + 'px ' + (opts.font || 'Georgia, serif'); } }
    g.textAlign = opts.align || 'center'; g.fillStyle = color;
    if (opts.shadow) { g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = size * 0.12; g.shadowOffsetY = size * 0.04; }
    if (opts.spacing) g.letterSpacing = opts.spacing + 'px';
    g.fillText(t, x, y); g.restore();
  };
  const pine = (x, y, h, col) => { g.fillStyle = col; for (let i = 0; i < 3; i++) { const w = h * (0.34 - i * 0.07), top = y - h + i * h * 0.26, bot = y - h * 0.42 + i * h * 0.3; g.beginPath(); g.moveTo(x, top); g.lineTo(x + w, bot); g.lineTo(x - w, bot); g.closePath(); g.fill(); } g.fillRect(x - h * 0.03, y - h * 0.16, h * 0.06, h * 0.16); };
  const flower = (x, y, r, petals, cols, centre) => { for (let i = 0; i < petals; i++) { g.save(); g.translate(x, y); g.rotate((i / petals) * Math.PI * 2); g.fillStyle = cols[i % cols.length]; g.beginPath(); g.ellipse(0, -r * 0.62, r * 0.3, r * 0.5, 0, 0, Math.PI * 2); g.fill(); g.restore(); } g.fillStyle = centre; g.beginPath(); g.arc(x, y, r * 0.26, 0, Math.PI * 2); g.fill(); };

  if (spec.style === 'woodland') {
    for (let i = 0; i < 220; i++) { g.fillStyle = 'rgba(255,244,214,' + (0.25 + rnd() * 0.65) + ')'; g.beginPath(); g.arc(rnd() * c.width, rnd() * c.height * 0.6, (0.6 + rnd() * 1.8) * (S / 150), 0, Math.PI * 2); g.fill(); }
    const mx = F.x + F.w * 0.5, my = F.y + F.h * 0.38, mr = F.w * 0.17;
    const glow = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 3.2); glow.addColorStop(0, 'rgba(255,236,170,.55)'); glow.addColorStop(1, 'rgba(255,236,170,0)'); g.fillStyle = glow; g.fillRect(mx - mr * 3.4, my - mr * 3.4, mr * 6.8, mr * 6.8);
    g.fillStyle = '#fdf0c8'; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(214,190,130,.5)'; [[-.3, -.2, .18], [.25, .1, .22], [-.1, .35, .12]].forEach(([dx, dy, k]) => { g.beginPath(); g.arc(mx + dx * mr, my + dy * mr, mr * k, 0, Math.PI * 2); g.fill(); });
    const layers = ['#1d4a5a', '#16394a', '#0e2a3a', '#081c2a'];
    layers.forEach((col, k) => {
      const base = c.height * (0.6 + k * 0.1), amp = c.height * (0.05 - k * 0.006), ph = rnd() * 6;
      g.fillStyle = col; g.beginPath(); g.moveTo(0, c.height);
      for (let x = 0; x <= c.width; x += 8) g.lineTo(x, base + Math.sin(x / (c.width / (3 + k)) + ph) * amp + Math.sin(x / (c.width / (9 + k * 3)) + ph * 2) * amp * 0.4);
      g.lineTo(c.width, c.height); g.closePath(); g.fill();
      for (let i = 0; i < 26 - k * 3; i++) pine(rnd() * c.width, base + amp * 0.6 + rnd() * c.height * 0.05, c.height * (0.12 + k * 0.035 + rnd() * 0.04), col);
    });
    const lx = F.x + F.w * 0.5, ly = F.y + F.h * 0.82;
    const lg = g.createRadialGradient(lx, ly, 2, lx, ly, F.w * 0.22); lg.addColorStop(0, 'rgba(255,200,90,.95)'); lg.addColorStop(1, 'rgba(255,170,60,0)'); g.fillStyle = lg; g.beginPath(); g.arc(lx, ly, F.w * 0.22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd77a'; g.fillRect(lx - F.w * 0.016, ly - F.w * 0.03, F.w * 0.032, F.w * 0.06);
    const fs = F.w * 0.13;
    text('THE LAST', F.x + F.w / 2, F.y + F.h * 0.085 + fs, fs, '#fdf0d5', { shadow: true, spacing: fs * 0.06, maxW: F.w * 0.8 });
    text('LANTERN', F.x + F.w / 2, F.y + F.h * 0.085 + fs * 2.15, fs * 1.18, '#ffd77a', { shadow: true, maxW: F.w * 0.8 });
    text('A NOVEL', F.x + F.w / 2, F.y + F.h * 0.085 + fs * 3.0, fs * 0.3, '#fdf0d5', { weight: '600', spacing: fs * 0.18, font: 'Segoe UI, Arial, sans-serif' });
    text('MARA ELLISON', F.x + F.w / 2, F.y + F.h * 0.955, F.w * 0.052, '#fdf0d5', { weight: '600', spacing: F.w * 0.012, font: 'Segoe UI, Arial, sans-serif' });
    g.fillStyle = 'rgba(8,20,36,.84)'; g.fillRect(P.x, 0, P.w, c.height);
    g.save(); g.translate(P.x + P.w / 2, c.height / 2); g.rotate(Math.PI / 2);
    text('THE LAST LANTERN', -c.height * 0.1, P.w * 0.17, P.w * 0.5, '#ffd77a', { shadow: false }); text('M. ELLISON', c.height * 0.34, P.w * 0.14, P.w * 0.3, '#fdf0d5', { weight: '600', font: 'Segoe UI, Arial, sans-serif' }); g.restore();
    g.fillStyle = '#ffd77a'; g.beginPath(); g.arc(P.x + P.w / 2, c.height * 0.93, P.w * 0.22, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(8,20,36,.5)'; g.fillRect(B.x + B.w * 0.08, B.y + B.h * 0.1, B.w * 0.84, B.h * 0.5);
    text('\\u201CA hushed, glowing mystery.\\u201D', B.x + B.w / 2, B.y + B.h * 0.18, B.w * 0.055, '#ffd77a', { weight: 'italic bold' });
    ['When the lamps along Harrow Bay go dark one by', 'one, keeper Ada Wren must follow the last light', 'into the pines, where the forest keeps its secrets', 'and every lantern hides a name.', '', 'Part ghost story, part love letter to the coast.'].forEach((l, i) => text(l, B.x + B.w / 2, B.y + B.h * (0.27 + i * 0.062), B.w * 0.04, '#fdf0d5', { weight: 'normal' }));
  } else {
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.18 + rnd() * 0.3) + ')'; g.beginPath(); g.arc(rnd() * c.width, rnd() * c.height, (4 + rnd() * 14) * (S / 150), 0, Math.PI * 2); g.fill(); }
    const pal = ['#ff7aa8', '#ffb347', '#ffd447', '#7ad6a1', '#6cb8ff', '#b58cff'];
    for (let i = 0; i < 34; i++) { const x = rnd() * c.width, y = rnd() * c.height, r = (28 + rnd() * 60) * (S / 150); flower(x, y, r, 5 + Math.floor(rnd() * 4), [pal[Math.floor(rnd() * pal.length)], pal[Math.floor(rnd() * pal.length)]], '#fff4c2'); }
    g.fillStyle = 'rgba(255,255,255,.88)'; g.beginPath(); g.arc(F.x + F.w / 2, F.y + F.h * 0.56, F.w * 0.4, 0, Math.PI * 2); g.fill();
    flower(F.x + F.w / 2, F.y + F.h * 0.56, F.w * 0.36, 12, ['#ff7aa8', '#ffb347', '#ff7aa8', '#b58cff'], '#ffd447');
    flower(F.x + F.w / 2, F.y + F.h * 0.56, F.w * 0.22, 9, ['#ffffff', '#ffe0ec'], '#ff7aa8');
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; flower(F.x + F.w / 2 + Math.cos(a) * F.w * 0.43, F.y + F.h * 0.56 + Math.sin(a) * F.w * 0.43, F.w * 0.085, 7, [pal[i % pal.length], '#fff'], '#fff4c2'); }
    g.fillStyle = '#2f6f4f'; g.fillRect(F.x + F.w * 0.08, F.y + F.h * 0.055, F.w * 0.84, F.h * 0.2);
    text('WILD GARDEN', F.x + F.w / 2, F.y + F.h * 0.155, F.w * 0.125, '#fff4c2', { shadow: true, maxW: F.w * 0.76 });
    text('COLORING BOOK', F.x + F.w / 2, F.y + F.h * 0.225, F.w * 0.052, '#ffffff', { weight: '600', spacing: F.w * 0.012, font: 'Segoe UI, Arial, sans-serif' });
    text('50 designs to relax and unwind', F.x + F.w / 2, F.y + F.h * 0.945, F.w * 0.045, '#2f6f4f', { weight: '600', font: 'Segoe UI, Arial, sans-serif' });
    g.fillStyle = '#2f6f4f'; g.fillRect(P.x, 0, P.w, c.height);
    g.save(); g.translate(P.x + P.w / 2, c.height / 2); g.rotate(Math.PI / 2); text('WILD GARDEN COLORING BOOK', 0, P.w * 0.15, Math.min(P.w * 0.52, c.height * 0.05), '#fff4c2'); g.restore();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(B.x + B.w * 0.1, B.y + B.h * 0.12, B.w * 0.8, B.h * 0.5);
    text('Relax. Color. Bloom.', B.x + B.w / 2, B.y + B.h * 0.24, B.w * 0.075, '#2f6f4f');
    ['Fifty hand-drawn flower designs, each on its', 'own single-sided page so markers never bleed', 'through. From simple blooms to detailed', 'mandalas, there is something for every mood.'].forEach((l, i) => text(l, B.x + B.w / 2, B.y + B.h * (0.34 + i * 0.085), B.w * 0.045, '#33423a', { weight: 'normal' }));
  }
  g.fillStyle = '#fff'; g.fillRect(BC.x, BC.y, BC.w, BC.h); g.fillStyle = '#111';
  for (let i = 0; i < 46; i++) { const bx = BC.x + BC.w * 0.08 + i * (BC.w * 0.84 / 46); g.fillRect(bx, BC.y + BC.h * 0.1, (rnd() > 0.5 ? 2 : 1) * (S / 150) * 1.6, BC.h * 0.7); }
  return c.toDataURL('image/png');
}`;

function artSpec(l: CoverLayout, style: ArtSpec['style'], seed: number): ArtSpec {
  const r = (x: Rect): Rect => ({ x: x.x, y: x.y, w: x.w, h: x.h });
  return {
    style,
    seed,
    S: 150,
    canvas: l.canvas,
    back: r(l.back),
    spine: r(l.spine),
    front: r(l.front),
    barcode: r(l.barcode),
    sky: style === 'woodland' ? ['#0b1a3a', '#1b3a6b', '#3d5f8f', '#e29b6a'] : ['#ffe6f0', '#fff4d6', '#e4f6e9'],
  };
}

async function makeArt(l: CoverLayout, style: ArtSpec['style'], seed: number): Promise<Uint8Array> {
  const url = await js<string>(`(${ART_JS})(${JSON.stringify(artSpec(l, style, seed))})`);
  return Uint8Array.from(Buffer.from(url.split(',')[1]!, 'base64'));
}

/** A single-page PDF exactly the size of the cover, with the artwork filling it. */
async function artToPdf(png: Uint8Array, widthIn: number, heightIn: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([widthIn * 72, heightIn * 72]);
  const img = await doc.embedPng(png);
  page.drawImage(img, { x: 0, y: 0, width: widthIn * 72, height: heightIn * 72 });
  return doc.save();
}

async function upload(inputId: string, name: string, mime: string, bytes: Uint8Array): Promise<void> {
  const b64 = Buffer.from(bytes).toString('base64');
  await js(`(async () => {
    const bin = atob(${JSON.stringify(b64)}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([a], ${JSON.stringify(name)}, { type: ${JSON.stringify(mime)} }));
    const input = document.getElementById(${JSON.stringify(inputId)}); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

// ---------------------------------------------------------------------------------------------------------------------
// App control, screenshots, recording
// ---------------------------------------------------------------------------------------------------------------------

async function pageSocket(): Promise<string> {
  for (let i = 0; i < 80; i++) {
    try {
      const list = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) as { type: string; url: string; webSocketDebuggerUrl: string }[];
      const p = list.find((t) => t.type === 'page' && t.url.includes('index.html'));
      if (p) return p.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(400);
  }
  throw new Error('Electron window did not appear.');
}

async function viewport(width: number, height: number, scale: number): Promise<void> {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  await sleep(500);
}

async function theme(mode: 'light' | 'dark'): Promise<void> {
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] });
  await sleep(300);
}

async function resetApp(): Promise<void> {
  await js(`localStorage.clear()`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(900);
  await waitFor(`document.getElementById('canvas-primary')?.textContent.length > 1`);
  await js(CURSOR_JS);
  await js(`window.scrollTo(0, 0)`);
  await sleep(300);
}

async function setBook(b: { binding?: 'paperback' | 'hardcover'; trim?: string; pages?: number; paper?: string }): Promise<void> {
  if (b.binding) await js(`document.querySelector('#binding-toggle [data-v="${b.binding}"]').click()`);
  if (b.trim) await setSelect('#trim', b.trim);
  if (b.paper) await js(`document.querySelector('input[name=paper][value="${b.paper}"]').click()`);
  if (b.pages) await js(`(() => { const e = document.getElementById('pages'); e.value = '${b.pages}'; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(400);
}

async function tab(id: 'cover' | 'ebook' | 'preflight' | 'mockup'): Promise<void> {
  await js(`document.querySelector('[data-tab="${id}"]').click()`);
  await sleep(500);
}

async function shot(name: string, clip?: string): Promise<void> {
  await js(`(() => { const c = document.getElementById('__cur'); if (c) c.style.visibility = 'hidden'; })()`);
  let params: Record<string, unknown> = { format: 'png' };
  if (clip) {
    const r = await rectOf(clip);
    params = { ...params, captureBeyondViewport: true, clip: { x: r.x, y: r.y + (await js<number>('window.scrollY')), width: r.w, height: r.h, scale: 1 } };
  }
  const { data } = await cdp.send<{ data: string }>('Page.captureScreenshot', params);
  writeFileSync(join(DIRS.shots, `${name}.png`), Buffer.from(data, 'base64'));
  await js(`(() => { const c = document.getElementById('__cur'); if (c) c.style.visibility = 'visible'; })()`);
  log('screenshot', name);
}

/** Record the page while `fn` runs, then encode MP4 + GIF. */
async function record(name: string, fn: () => Promise<void>): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), `kdp-rec-${name}-`));
  const frames: { file: string; t: number }[] = [];
  let n = 0;
  cdp.on('Page.screencastFrame', (p: { data: string; sessionId: number; metadata: { timestamp: number } }) => {
    const file = join(tmp, `f${String(n++).padStart(6, '0')}.jpg`);
    writeFileSync(file, Buffer.from(p.data, 'base64'));
    frames.push({ file, t: p.metadata.timestamp });
    void cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  await sleep(600);
  await fn();
  await sleep(1200);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame');
  if (frames.length < 2) throw new Error(`No frames captured for ${name}`);

  // Constant-frame-rate encode from the variable-timing frames.
  const lines: string[] = [];
  frames.forEach((f, i) => {
    const next = frames[i + 1];
    const dur = next ? Math.max(1 / 120, next.t - f.t) : 1.2;
    lines.push(`file '${f.file.replace(/\\/g, '/')}'`, `duration ${dur.toFixed(4)}`);
  });
  lines.push(`file '${frames.at(-1)!.file.replace(/\\/g, '/')}'`);
  const list = join(tmp, 'list.txt');
  writeFileSync(list, lines.join('\n'));
  const mp4 = join(DIRS.videos, `${name}.mp4`);
  const gif = join(DIRS.videos, `${name}.gif`);
  const enc = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-movflags', '+faststart', mp4], { encoding: 'utf8' });
  if (enc.status !== 0) throw new Error(`ffmpeg mp4 failed: ${enc.stderr}`);
  const g = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', gif], { encoding: 'utf8' });
  if (g.status !== 0) log('gif failed:', g.stderr);
  rmSync(tmp, { recursive: true, force: true });
  log('video', name, `${frames.length} frames`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------------------------------------------------

const BOOK_A: CoverInput = { trimWidth: 6, trimHeight: 9, trimId: '6x9', pageCount: 200, paper: 'bw-white', readingDirection: 'ltr' };
const BOOK_A240: CoverInput = { ...BOOK_A, pageCount: 240 };
const BOOK_B: CoverInput = { trimWidth: 8.5, trimHeight: 8.5, trimId: '8.5x8.5', pageCount: 110, paper: 'bw-white', readingDirection: 'ltr' };
const BOOK_C: CoverInput = { ...BOOK_A, binding: 'hardcover' };

let art: { a: Uint8Array; a240: Uint8Array; b: Uint8Array; c: Uint8Array };

async function screenshots(): Promise<void> {
  log('--- screenshots');
  await viewport(1440, 1000, 2);
  await theme('light');

  // 1 + closeups: paperback template
  await resetApp();
  await shot('01-cover-template-paperback');
  await shot('01b-template-closeup', '#preview');
  await shot('01c-canvas-size-card', '.canvas-card');

  // 2: hardcover
  await click('#binding-toggle [data-v="hardcover"]', { ms: 300 });
  await sleep(500);
  await shot('02-cover-template-hardcover');
  await shot('02b-hardcover-closeup', '#preview');

  // 3: eBook
  await tab('ebook');
  await shot('03-kindle-ebook');

  // 4: preflight pass
  await resetApp();
  await tab('preflight');
  await upload('pf-file', 'the-last-lantern-cover.pdf', 'application/pdf', await artToPdf(art.a, 12.7004, 9.25));
  await waitFor(`!document.getElementById('pf-result').hidden`);
  await sleep(1200);
  await scrollTo('#pf-verdict', -90);
  await shot('04-preflight-pass');
  await scrollTo('#pf-preview', -120);
  await shot('04b-preflight-overlay');

  // 5: preflight diagnosis
  await upload('pf-file', 'the-last-lantern-240pp.pdf', 'application/pdf', await artToPdf(art.a240, 12.7905, 9.25));
  await sleep(1800);
  await scrollTo('#pf-verdict', -90);
  await shot('05-preflight-diagnosis');

  // 6: 3D mockup (square coloring book)
  await resetApp();
  await setBook({ trim: '8.5x8.5', pages: 110 });
  await tab('mockup');
  await upload('mock-file', 'wild-garden-cover.png', 'image/png', art.b);
  await sleep(2500);
  await shot('06-3d-mockup-square');
  await shot('06b-mockup-stage', '#mock-stage');

  // 7: dark mode
  await theme('dark');
  await shot('07-3d-mockup-dark');
  await tab('cover');
  await sleep(500);
  await shot('08-cover-template-dark');
  await theme('light');
}

async function mockups(): Promise<void> {
  log('--- mockup images');
  await viewport(1440, 1000, 1);
  await theme('light');
  await resetApp();
  await setBook({ trim: '8.5x8.5', pages: 110 });
  await tab('mockup');
  await upload('mock-file', 'wild-garden-cover.png', 'image/png', art.b);
  await sleep(2500);

  const before = () => new Set(readdirSync(DL));
  const make = async (label: string, o: { pose?: string; aspect?: string; bg?: string; finish?: 'matte' | 'glossy'; size?: number; format?: 'png' | 'jpg' }) => {
    if (o.pose) await js(`document.querySelector('#mock-pose [data-v="${o.pose}"]').click()`);
    if (o.aspect) await js(`document.querySelector('#mock-aspect [data-v="${o.aspect}"]').click()`);
    if (o.bg) await js(`document.querySelector('#mock-bg [data-v="${o.bg}"]').click()`);
    if (o.finish) await js(`document.querySelector('#mock-finish [data-v="${o.finish}"]').click()`);
    if (o.size) await setSelect('#mock-size', String(o.size));
    if (o.format) await js(`document.querySelector('#mock-format [data-v="${o.format}"]').click()`);
    await sleep(1800);
    const seen = before();
    await js(`document.getElementById('mock-download').click()`);
    const end = Date.now() + 25000;
    let file: string | undefined;
    while (Date.now() < end && !file) {
      await sleep(400);
      file = readdirSync(DL).find((f) => !seen.has(f) && f.startsWith('kdp-book-mockup'));
    }
    if (!file) throw new Error(`mockup export did not appear for ${label}`);
    await sleep(300);
    const ext = file.split('.').pop();
    renameSync(join(DL, file), join(DIRS.mockups, `${label}.${ext}`));
    log('mockup', label);
  };

  await make('mockup-01-standing-square-studio', { pose: 'hero', aspect: '1:1', bg: 'studio', finish: 'matte', size: 2000, format: 'png' });
  await make('mockup-02-front-on-white', { pose: 'front', bg: 'white' });
  await make('mockup-03-floating-mint-glossy', { pose: 'floating', bg: 'mint', finish: 'glossy' });
  await make('mockup-04-pair-blush', { pose: 'pair', bg: 'blush', finish: 'matte' });
  await make('mockup-05-stack-warm', { pose: 'stack', bg: 'warm' });
  await make('mockup-06-lying-flat-studio', { pose: 'flat', bg: 'studio' });
  await make('mockup-07-back-and-spine', { pose: 'back', bg: 'studio' });
  await make('mockup-08-spine-night', { pose: 'spine', bg: 'night' });
  await make('mockup-09-standing-transparent', { pose: 'hero', bg: 'clear', format: 'png' });
  await make('mockup-10-standing-4x5', { pose: 'hero', aspect: '4:5', bg: 'warm', format: 'png' });
  await make('mockup-11-floating-wide-night', { pose: 'floating', aspect: '16:9', bg: 'night', finish: 'glossy' });

  // Hardcover novel
  await resetApp();
  await setBook({ binding: 'hardcover', trim: '6x9', pages: 200 });
  await tab('mockup');
  await upload('mock-file', 'the-last-lantern-hardcover.png', 'image/png', art.c);
  await sleep(2500);
  await make('mockup-12-hardcover-standing-square', { pose: 'hero', aspect: '1:1', bg: 'studio', finish: 'glossy', size: 2000, format: 'png' });
  await make('mockup-13-hardcover-lying-flat', { pose: 'flat', bg: 'warm' });
}

async function videos(): Promise<void> {
  log('--- videos');
  await viewport(1440, 900, 1);
  await theme('light');

  // 1) Cover template: live numbers, hardcover, units, overlay, download
  await resetApp();
  await record('kdp-perfect-cover-template', async () => {
    await sleep(1200);
    await typeInto('#pages', '320');
    await sleep(900);
    await click('#unit-toggle [data-v="cm"]');
    await sleep(700);
    await click('#unit-toggle [data-v="in"]');
    await click('#binding-toggle [data-v="hardcover"]');
    await sleep(1400);
    await scrollTo('#cover-preview-wrap', -90, 900);
    await sleep(900);
    await click('#preview-toggle [data-v="overlay"]');
    await sleep(1200);
    await click('#preview-toggle [data-v="template"]');
    await click('#binding-toggle [data-v="paperback"]');
    await sleep(1000);
    await scrollTo('#cover-exports', -140, 800);
    await click('#format-toggle [data-v="pdf"]');
    await sleep(500);
    await click('#download');
    await sleep(1800);
  });

  // 2) Preflight: pass, then a diagnosis
  await resetApp();
  await tab('preflight');
  await record('kdp-perfect-preflight', async () => {
    await sleep(1000);
    await pretendClick('#pf-drop');
    await upload('pf-file', 'the-last-lantern-cover.pdf', 'application/pdf', await artToPdf(art.a, 12.7004, 9.25));
    await waitFor(`!document.getElementById('pf-result').hidden`);
    await sleep(1500);
    await scrollTo('#pf-verdict', -90, 900);
    await sleep(1600);
    await scrollTo('#pf-preview', -100, 1000);
    await sleep(1800);
    await scrollTo('#pf-drop', -120, 900);
    await pretendClick('#pf-drop');
    await upload('pf-file', 'the-last-lantern-240pp.pdf', 'application/pdf', await artToPdf(art.a240, 12.7905, 9.25));
    await sleep(1800);
    await scrollTo('#pf-verdict', -90, 900);
    await sleep(2800);
  });

  // 3) 3D mockup
  await resetApp();
  await setBook({ trim: '8.5x8.5', pages: 110 });
  await tab('mockup');
  await upload('mock-file', 'wild-garden-cover.png', 'image/png', art.b);
  await sleep(2600);
  await record('kdp-perfect-3d-mockup', async () => {
    await sleep(1200);
    const stage = await rectOf('#mock-stage');
    const c = { x: stage.x + stage.w / 2, y: stage.y + stage.h / 2 };
    await drag({ x: c.x + 90, y: c.y }, { x: c.x - 130, y: c.y - 30 });
    await sleep(500);
    await click('#mock-pose [data-v="front"]');
    await sleep(900);
    await click('#mock-pose [data-v="floating"]');
    await sleep(900);
    await click('#mock-pose [data-v="pair"]');
    await sleep(900);
    await click('#mock-pose [data-v="stack"]');
    await sleep(900);
    await click('#mock-pose [data-v="flat"]');
    await sleep(900);
    await click('#mock-pose [data-v="hero"]');
    await sleep(700);
    await click('#mock-bg [data-v="mint"]');
    await sleep(700);
    await click('#mock-bg [data-v="blush"]');
    await sleep(700);
    await click('#mock-bg [data-v="night"]');
    await sleep(800);
    await click('#mock-finish [data-v="glossy"]');
    await sleep(900);
    await click('#mock-aspect [data-v="4:5"]');
    await sleep(1000);
    await click('#mock-aspect [data-v="1:1"]');
    await sleep(900);
    await click('#mock-bg [data-v="studio"]');
    await sleep(1400);
  });

  // 4) Tour: every tab in ~25 seconds
  await resetApp();
  await record('kdp-perfect-tour', async () => {
    await sleep(1500);
    await click('#binding-toggle [data-v="hardcover"]');
    await sleep(1300);
    await click('#binding-toggle [data-v="paperback"]');
    await sleep(900);
    await click('[data-tab="ebook"]');
    await sleep(1800);
    await click('[data-tab="preflight"]');
    await sleep(900);
    await upload('pf-file', 'cover.pdf', 'application/pdf', await artToPdf(art.a, 12.7004, 9.25));
    await waitFor(`!document.getElementById('pf-result').hidden`);
    await sleep(1800);
    await click('[data-tab="mockup"]');
    await upload('mock-file', 'cover.png', 'image/png', art.a);
    await sleep(2600);
    await click('#mock-pose [data-v="floating"]');
    await sleep(1400);
    await click('#mock-pose [data-v="pair"]');
    await sleep(1800);
  });
}

// ---------------------------------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('Run `npm run build` first.');
  for (const d of [...Object.values(DIRS), DL]) mkdirSync(d, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'kdp-mkt-profile-'));
  electron = spawn(electronPath, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`], {
    cwd: ROOT,
    stdio: 'ignore',
    env: { ...process.env, KDP_SMOKE_DIR: DL },
  });
  try {
    cdp = await CDP.connect(await pageSocket());
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await viewport(1440, 1000, 2);
    await resetApp();

    log('generating artwork');
    art = {
      a: await makeArt(computeCoverLayout(BOOK_A), 'woodland', 11),
      a240: await makeArt(computeCoverLayout(BOOK_A240), 'woodland', 11),
      b: await makeArt(computeCoverLayout(BOOK_B), 'garden', 7),
      c: await makeArt(computeCoverLayout(BOOK_C), 'woodland', 11),
    };

    if (want('screenshots')) await screenshots();
    if (want('mockups')) await mockups();
    if (want('videos')) await videos();

    // The app's own template exports are marketing material too; mockup exports were already renamed into Mockups/.
    for (const f of readdirSync(DL)) {
      if (/^kdp-book-mockup/.test(f)) rmSync(join(DL, f));
      else renameSync(join(DL, f), join(DIRS.exports, f));
    }
    rmSync(DL, { recursive: true, force: true });
    log('done ->', OUT);
  } finally {
    electron.kill();
    await sleep(600);
    // Windows can hold the profile for a moment after Electron exits; leftover temp files are harmless.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error(e);
  electron?.kill();
  process.exit(1);
});
