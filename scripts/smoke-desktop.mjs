// End-to-end check of the desktop app: launches Electron against dist/ (or a packaged exe), drives the UI over the
// Chrome DevTools Protocol, downloads files through the real IPC path and inspects what was written.
//
// Covers: paperback PNG/JPG/PDF/overlay, hardcover PDF, Kindle eBook JPG, the Preflight screen (uploads the exported
// PDF, which also proves pdf.js and its worker run under file:// and the CSP), and the 3D mockup (WebGL + PNG export).
//
//   npm run smoke                                   (builds first, tests `electron .`)
//   node scripts/smoke-desktop.mjs --exe "release/win-unpacked/KDP Perfect.exe"   (tests a packaged build)
//
// The main process writes straight into KDP_SMOKE_DIR instead of opening a Save As dialog when that variable is set.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const PORT = 9333;
const out = mkdtempSync(join(tmpdir(), 'kdp-smoke-out-'));
const profile = mkdtempSync(join(tmpdir(), 'kdp-smoke-profile-'));

// `--exe <path>` tests a packaged build (e.g. release/win-unpacked/KDP Perfect.exe) instead of `electron .`
const exeIdx = process.argv.indexOf('--exe');
const exe = exeIdx > -1 ? process.argv[exeIdx + 1] : undefined;
const flags = [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`];
const child = spawn(exe ?? electronPath, exe ? flags : ['.', ...flags], {
  stdio: 'ignore',
  env: { ...process.env, KDP_SMOKE_DIR: out },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

async function pageSocket() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('index.html'));
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error('Electron window did not appear.');
}

/** Pixel size of a PNG (IHDR) or JPEG (SOF marker). */
function imageSize(buf) {
  if (buf.subarray(1, 4).toString() === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  let pos = 2;
  while (pos < buf.length - 9) {
    if (buf[pos] !== 0xff) break;
    const marker = buf[pos + 1];
    const len = buf.readUInt16BE(pos + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: buf.readUInt16BE(pos + 5), w: buf.readUInt16BE(pos + 7) };
    pos += 2 + len;
  }
  return null;
}

try {
  const ws = new WebSocket(await pageSocket());
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
  };
  const evaluate = (expression) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, (msg) => resolve(msg.result?.result?.value ?? (msg.result?.exceptionDetails ? `EXCEPTION: ${msg.result.exceptionDetails.text}` : undefined)));
      ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const files = () => readdirSync(out).sort();
  const find = (re) => files().find((f) => re.test(f));
  const waitFor = async (fn, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = await fn();
      if (v) return v;
      await sleep(300);
    }
    return null;
  };

  await sleep(800);
  check((await evaluate('document.title')) === 'KDP Perfect', 'window title');
  check((await evaluate('typeof window.kdpDesktop?.saveFile')) === 'function', 'desktop bridge exposed to the page');
  check((await evaluate('typeof require + typeof process')) === 'undefinedundefined', 'Node is not exposed to the page');
  const canvas = await evaluate("document.getElementById('canvas-primary').textContent");
  console.log(`      default canvas: ${canvas}`);
  check(/12\.7004" . 9\.25"/.test(canvas), 'default 6x9 / 200pp canvas = 12.7004" x 9.25"');

  // ---- Paperback cover template: PNG, JPG, PDF, overlay PNG --------------------------------------------------------
  for (const fmt of ['png', 'jpg', 'pdf']) {
    await click(`#format-toggle [data-v="${fmt}"]`);
    await click('#download');
    await waitFor(() => find(new RegExp(`^kdp-cover-template.*\\.${fmt}$`)));
  }
  await click('#variant-toggle [data-v="overlay"]');
  await click('#format-toggle [data-v="png"]');
  await click('#download');
  await waitFor(() => find(/overlay.*\.png$/));

  const png = find(/^kdp-cover-template.*\.png$/);
  const jpg = find(/^kdp-cover-template.*\.jpg$/);
  const pdf = find(/^kdp-cover-template.*\.pdf$/);
  check(!!png && !!jpg && !!pdf && !!find(/overlay.*\.png$/), 'paperback PNG, JPG, PDF and overlay PNG were all written');
  if (png) {
    const b = readFileSync(join(out, png));
    const s = imageSize(b);
    check(s?.w === 3810 && s?.h === 2775, `PNG pixel size ${s?.w} x ${s?.h} (expect 3810 x 2775)`);
    check(b.includes(Buffer.from('pHYs')), 'PNG carries DPI (pHYs)');
  }
  if (jpg) {
    const b = readFileSync(join(out, jpg));
    check(b[0] === 0xff && b[1] === 0xd8, 'JPG signature');
    check(b[13] === 1 && b.readUInt16BE(14) === 300, 'JPG density tagged 300 DPI');
  }
  if (pdf) {
    const page = (await PDFDocument.load(readFileSync(join(out, pdf)))).getPage(0).getSize();
    check(Math.abs(page.width - 12.7004 * 72) < 0.05 && Math.abs(page.height - 9.25 * 72) < 0.05, `paperback PDF page ${page.width.toFixed(2)} x ${page.height.toFixed(2)} pt (expect ${(12.7004 * 72).toFixed(2)} x 666)`);
  }

  // ---- Hardcover PDF -----------------------------------------------------------------------------------------------
  await click('#variant-toggle [data-v="template"]');
  await click('#binding-toggle [data-v="hardcover"]');
  await sleep(300);
  check(/14\.2142" . 10\.4173"/.test(await evaluate("document.getElementById('canvas-primary').textContent")), 'hardcover 6x9 / 200pp canvas = 14.2142" x 10.4173" (matches KDP calculator)');
  await click('#format-toggle [data-v="pdf"]');
  await click('#download');
  const hc = await waitFor(() => find(/hardcover.*\.pdf$/));
  check(!!hc, 'hardcover PDF was written');
  if (hc) {
    const page = (await PDFDocument.load(readFileSync(join(out, hc)))).getPage(0).getSize();
    check(Math.abs(page.width - 14.21418 * 72) < 0.05 && Math.abs(page.height - 10.41732 * 72) < 0.05, `hardcover PDF page ${page.width.toFixed(2)} x ${page.height.toFixed(2)} pt`);
  }
  await click('#binding-toggle [data-v="paperback"]');

  // ---- Kindle eBook ------------------------------------------------------------------------------------------------
  await click('[data-tab="ebook"]');
  await sleep(300);
  check((await evaluate("document.getElementById('ebook-primary').textContent")).includes('1600'), 'eBook screen shows 1600 x 2560 px');
  await click('#ebook-download');
  const eb = await waitFor(() => find(/ebook.*\.jpg$/));
  check(!!eb, 'eBook cover JPG was written');
  if (eb) {
    const b = readFileSync(join(out, eb));
    const s = imageSize(b);
    check(s?.w === 1600 && s?.h === 2560, `eBook JPG pixel size ${s?.w} x ${s?.h} (expect 1600 x 2560)`);
  }

  // ---- Preflight (uploads the exported paperback PDF; renders it with pdf.js) --------------------------------------
  await click('[data-tab="preflight"]');
  await sleep(300);
  if (pdf) {
    const b64 = readFileSync(join(out, pdf)).toString('base64');
    await evaluate(`(async () => {
      const bytes = Uint8Array.from(atob('${b64}'), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'cover.pdf', { type: 'application/pdf' }));
      const input = document.getElementById('pf-file');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    const verdict = await waitFor(async () => (await evaluate("!document.getElementById('pf-result').hidden")) && (await evaluate("document.getElementById('pf-verdict').className")));
    check(verdict === 'verdict pass', `preflight accepts the exact-size cover PDF (verdict: ${verdict})`);
    const drawn = await evaluate("(document.querySelector('#pf-preview canvas')?.width ?? 0) > 100");
    check(drawn === true, 'preflight draws the PDF with pdf.js (worker + CSP work)');
  }

  // ---- 3D mockup ---------------------------------------------------------------------------------------------------
  await click('[data-tab="mockup"]');
  const rendered = await waitFor(async () => {
    const r = await evaluate(`(() => {
      const c = document.getElementById('mock-canvas');
      if (!c || c.width < 50) return false;
      if (!document.getElementById('mock-msg').hidden) return 'msg:' + document.getElementById('mock-msg').textContent;
      const probe = document.createElement('canvas'); probe.width = 64; probe.height = 64;
      const g = probe.getContext('2d'); g.drawImage(c, 0, 0, 64, 64);
      const d = g.getImageData(0, 0, 64, 64).data;
      let opaque = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) opaque++;
      return opaque > 200;
    })()`);
    return r;
  }, 25000);
  check(rendered === true, `3D mockup renders in the desktop app (${rendered === true ? 'WebGL ok' : rendered})`);
  await click('#mock-download');
  const mock = await waitFor(() => find(/kdp-book-mockup.*\.png$/), 20000);
  check(!!mock, '3D mockup PNG was written');
  if (mock) {
    const s = imageSize(readFileSync(join(out, mock)));
    check(s?.w === 2000 && s?.h === 2000, `mockup PNG is ${s?.w} x ${s?.h} (square 1:1, expect 2000 x 2000)`);
  }
  console.log(`      files: ${files().join(', ')}`);
  ws.close();
} catch (err) {
  console.error(err);
  failures.push(String(err));
} finally {
  child.kill();
  await sleep(500);
  rmSync(out, { recursive: true, force: true });
  rmSync(profile, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nDesktop smoke test passed.');
