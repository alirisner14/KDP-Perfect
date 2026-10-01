// End-to-end check of the packaged-style desktop app: launches Electron against dist/, drives the UI over the
// Chrome DevTools Protocol, downloads PNG/JPG/PDF through the real IPC path and inspects the files written.
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
      pending.set(n, (msg) => resolve(msg.result?.result?.value));
      ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });

  await sleep(800);
  check((await evaluate('document.title')) === 'KDP Perfect', 'window title');
  check((await evaluate("typeof window.kdpDesktop?.saveFile")) === 'function', 'desktop bridge exposed to the page');
  check((await evaluate('typeof require + typeof process')) === 'undefinedundefined', 'Node is not exposed to the page');
  const canvas = await evaluate("document.getElementById('canvas-primary').textContent");
  console.log(`      default canvas: ${canvas}`);
  check(/12\.7004" . 9\.25"/.test(canvas), 'default 6x9 / 200pp canvas = 12.7004" x 9.25"');

  for (const fmt of ['png', 'jpg', 'pdf']) {
    await evaluate(`document.querySelector('#format-toggle button[data-v="${fmt}"]').click()`);
    await evaluate("document.getElementById('download').click()");
    await sleep(1500);
  }
  await evaluate(`document.querySelector('#variant-toggle button[data-v="overlay"]').click()`);
  await evaluate(`document.querySelector('#format-toggle button[data-v="png"]').click()`);
  await evaluate("document.getElementById('download').click()");
  await sleep(1500);

  const files = readdirSync(out).sort();
  console.log(`      files: ${files.join(', ')}`);
  const find = (re) => files.find((f) => re.test(f));
  const png = find(/^kdp-cover-template.*\.png$/);
  const jpg = find(/\.jpg$/);
  const pdf = find(/\.pdf$/);
  const overlay = find(/overlay.*\.png$/);
  check(!!png && !!jpg && !!pdf && !!overlay, 'PNG, JPG, PDF and overlay PNG were all written');

  if (png) {
    const b = readFileSync(join(out, png));
    check(b.subarray(1, 4).toString() === 'PNG', 'PNG signature');
    check(b.readUInt32BE(16) === 3810 && b.readUInt32BE(20) === 2775, `PNG pixel size ${b.readUInt32BE(16)} x ${b.readUInt32BE(20)} (expect 3810 x 2775)`);
    check(b.includes(Buffer.from('pHYs')), 'PNG carries DPI (pHYs)');
  }
  if (jpg) {
    const b = readFileSync(join(out, jpg));
    check(b[0] === 0xff && b[1] === 0xd8, 'JPG signature');
    check(b[13] === 1 && b.readUInt16BE(14) === 300, 'JPG density tagged 300 DPI');
  }
  if (pdf) {
    const b = readFileSync(join(out, pdf));
    check(b.subarray(0, 5).toString() === '%PDF-', 'PDF signature');
    const page = (await PDFDocument.load(b)).getPage(0).getSize();
    check(
      Math.abs(page.width - 12.7004 * 72) < 0.05 && Math.abs(page.height - 9.25 * 72) < 0.05,
      `PDF page ${page.width.toFixed(2)} x ${page.height.toFixed(2)} pt (expect ${(12.7004 * 72).toFixed(2)} x 666)`,
    );
  }
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
