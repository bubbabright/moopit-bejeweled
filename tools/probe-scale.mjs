/**
 * Viewport-scaling gate.
 *
 * Phaser.Scale.FIT should size the canvas to the parent element, so the board fits
 * any window. This measures what actually happens at several viewport sizes and
 * fails if the canvas overflows the window or loses its aspect ratio.
 *
 * It exists because the container was once sized by its own content: the 720x900
 * canvas inflated #game to 720x900, Phaser read that as the parent size, computed
 * scale 1.0, and the board never shrank on a phone.
 *
 * Usage: node tools/probe-scale.mjs [baseUrl]
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] ?? 'https://gemfall.moopit.fun';
const PORT = 9355;

const VIEWPORTS = [
  { label: 'iPhone 14 portrait', width: 390, height: 844, dpr: 3, mobile: true },
  { label: 'small Android', width: 360, height: 640, dpr: 2, mobile: true },
  { label: 'iPhone landscape', width: 844, height: 390, dpr: 3, mobile: true },
  { label: 'iPad-ish', width: 820, height: 1180, dpr: 2, mobile: true },
  { label: 'short desktop', width: 760, height: 797, dpr: 1, mobile: false },
];

const chrome = spawn(
  'chromium',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--mute-audio',
    `--remote-debugging-port=${PORT}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const cleanup = () => {
  try {
    chrome.kill('SIGKILL');
  } catch {
    /* already gone */
  }
};
process.on('exit', cleanup);

async function findTarget() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('devtools endpoint never came up');
}

const ws = new WebSocket(await findTarget());
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let messageId = 0;
const pending = new Map();

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
};

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
};

await send('Page.enable');
await send('Runtime.enable');

const pump = `
  window.__t = performance.now();
  window.__pump = (frames, dt = 16.7) => {
    const game = window.gemfall;
    if (!game) return 0;
    for (let i = 0; i < frames; i++) { window.__t += dt; game.loop.step(window.__t); }
    return game.loop.frame;
  };
  'ok'
`;

/** Reads the DOM box plus Phaser's own idea of the canvas size. */
const MEASURE = `
  (() => {
    const game = window.gemfall;
    if (!game) return { error: 'no game' };
    const canvas = document.querySelector('canvas');
    const gameDiv = document.getElementById('game');
    const cr = canvas ? canvas.getBoundingClientRect() : null;
    const gr = gameDiv ? gameDiv.getBoundingClientRect() : null;
    const s = game.scale;
    const MODES = { 0: 'NONE', 1: 'WIDTH_CONTROLS_HEIGHT', 2: 'HEIGHT_CONTROLS_WIDTH',
                    3: 'FIT', 4: 'ENVELOP', 5: 'RESIZE', 6: 'EXPAND' };
    return {
      appVersion: window.gemfallVersion ?? null,
      phaserVersion: window.gemfallPhaser ?? null,
      inner: { w: window.innerWidth, h: window.innerHeight },
      visual: window.visualViewport
        ? { w: Math.round(window.visualViewport.width), h: Math.round(window.visualViewport.height) }
        : null,
      gameDiv: gr ? { w: Math.round(gr.width), h: Math.round(gr.height) } : null,
      canvasBox: cr ? { w: Math.round(cr.width), h: Math.round(cr.height),
                        left: Math.round(cr.left), top: Math.round(cr.top) } : null,
      canvasAttr: canvas ? { w: canvas.width, h: canvas.height } : null,
      canvasStyle: canvas ? { w: canvas.style.width, h: canvas.style.height, margin: canvas.style.margin } : null,
      scaleMode: MODES[s.scaleMode] ?? String(s.scaleMode),
      displaySize: { w: Math.round(s.displaySize.width), h: Math.round(s.displaySize.height) },
      parentSize: { w: s.parentSize.width, h: s.parentSize.height },
      baseSize: { w: s.baseSize.width, h: s.baseSize.height },
      autoCenter: s.autoCenter,
    };
  })()
`;

const BASE_ASPECT = 720 / 900; // 0.8
const failures = [];

console.log(`probing ${BASE}\n`);

for (const vp of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: vp.dpr,
    mobile: vp.mobile,
  });
  await send('Page.navigate', { url: BASE });
  await sleep(1800);
  try {
    await evaluate(pump);
    await evaluate('window.__pump(40)');
  } catch {
    /* pump is best-effort; measurement is what matters */
  }

  const m = await evaluate(MEASURE);
  console.log(`── ${vp.label}  (${vp.width}x${vp.height} @${vp.dpr}x, mobile=${vp.mobile})`);
  if (m.appVersion) console.log(`   build         ${m.appVersion}  (phaser ${m.phaserVersion ?? '?'})`);

  if (m.error) {
    console.log(`   ${m.error}\n`);
    continue;
  }

  const fitsW = m.canvasBox && m.canvasBox.w <= m.inner.w + 1;
  const fitsH = m.canvasBox && m.canvasBox.h <= m.inner.h + 1;
  const spanH = m.canvasBox ? m.canvasBox.top + m.canvasBox.h : 0;

  console.log(`   window        ${m.inner.w}x${m.inner.h}${m.visual ? `  visual ${m.visual.w}x${m.visual.h}` : ''}`);
  console.log(`   #game div     ${m.gameDiv.w}x${m.gameDiv.h}`);
  console.log(`   canvas box    ${m.canvasBox.w}x${m.canvasBox.h} at (${m.canvasBox.left},${m.canvasBox.top})  bottom=${spanH}`);
  console.log(`   canvas attr   ${m.canvasAttr.w}x${m.canvasAttr.h}`);
  console.log(`   canvas style  w=${m.canvasStyle.w || '(none)'} h=${m.canvasStyle.h || '(none)'}`);
  console.log(`   phaser        mode=${m.scaleMode} display=${m.displaySize.w}x${m.displaySize.h} ` +
    `parent=${m.parentSize.w}x${m.parentSize.h} base=${m.baseSize.w}x${m.baseSize.h} center=${m.autoCenter}`);
  const aspect = m.canvasBox.w / m.canvasBox.h;
  const aspectOk = Math.abs(aspect - BASE_ASPECT) < 0.02;

  console.log(`   FITS?         width=${fitsW ? 'yes' : 'NO'}  height=${fitsH ? 'yes' : 'NO'}` +
    `${fitsH ? '' : `  (overflows by ${spanH - m.inner.h}px)`}`);
  console.log(`   aspect        ${aspect.toFixed(3)} (want ${BASE_ASPECT.toFixed(3)}) ${aspectOk ? 'ok' : 'WRONG'}`);
  console.log();

  if (m.scaleMode !== 'FIT') failures.push(`${vp.label}: scale mode is ${m.scaleMode}, expected FIT`);
  if (!fitsW) failures.push(`${vp.label}: canvas is wider than the window (${m.canvasBox.w} > ${m.inner.w})`);
  if (!fitsH) failures.push(`${vp.label}: canvas overflows vertically by ${spanH - m.inner.h}px`);
  if (!aspectOk) failures.push(`${vp.label}: aspect ratio ${aspect.toFixed(3)} != ${BASE_ASPECT.toFixed(3)}`);
}

ws.close();
cleanup();

if (failures.length === 0) {
  console.log('SCALING PASS');
  process.exit(0);
}
console.log('SCALING FAIL');
for (const f of failures) console.log(' -', f);
process.exit(1);
