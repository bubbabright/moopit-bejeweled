/**
 * Headless playtest driver.
 *
 * Headless Chromium barely ticks requestAnimationFrame, so this script drives Phaser's
 * loop manually (`game.loop.step(t)`) over the Chrome DevTools Protocol, dispatches real
 * mouse input, verifies the game state actually changes, and saves screenshots.
 *
 * It is the integration gate: it checks menu geometry, that a tap on a button's centre
 * hits that button, and that a full move actually resolves on the board.
 *
 * Usage: node tools/playtest.mjs [baseUrl]
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173';
const PORT = 9333;
const OUT_DIR = 'poc';

mkdirSync(OUT_DIR, { recursive: true });

// ── launch chromium ───────────────────────────────────────────────────────────

const chrome = spawn(
  'chromium',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--mute-audio',
    '--window-size=760,940',
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

/** Wait for the devtools endpoint, then return the first page target's websocket URL. */
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

const wsUrl = await findTarget();
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let messageId = 0;
const pending = new Map();
const consoleErrors = [];

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(`${message.error.message} (${JSON.stringify(message.error)})`));
    else resolve(message.result);
    return;
  }

  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    consoleErrors.push(`EXCEPTION: ${details.exception?.description ?? details.text}`);
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(`CONSOLE.ERROR: ${message.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
};

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`eval failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
  }
  return result.result.value;
};

// ── page plumbing ─────────────────────────────────────────────────────────────

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: BASE });
await sleep(1500);

/** Install a monotonic frame pump, since rAF is throttled in headless. */
const installPump = `
  window.__t = performance.now();
  window.__pump = (frames, dt = 16.7) => {
    const game = window.gemfall;
    if (!game) return 0;
    for (let i = 0; i < frames; i++) { window.__t += dt; game.loop.step(window.__t); }
    return game.loop.frame;
  };
  'ok'
`;

const pump = (frames) => evaluate(`window.__pump(${frames})`);

const waitFor = async (expression, label, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${label}`);
};

await waitFor('!!window.gemfall', 'phaser to boot');
await evaluate(installPump);
await pump(80);
await evaluate('true');

// Phaser input needs the canvas to have bounds and the scale manager to be ready.
const canvasInfo = await evaluate(`
  (() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return {
      w: r.width,
      h: r.height,
      left: r.left,
      top: r.top,
      dpr: window.devicePixelRatio,
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  })()
`);
console.log('canvas rect:', canvasInfo);

/** Game coordinates → viewport coordinates. */
const toPage = (gx, gy) => ({
  x: canvasInfo.left + (gx * canvasInfo.w) / 720,
  y: canvasInfo.top + (gy * canvasInfo.h) / 900,
});

const click = async (gx, gy) => {
  const { x, y } = toPage(gx, gy);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};

const screenshot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const path = `${OUT_DIR}/${name}.png`;
  writeFileSync(path, Buffer.from(data, 'base64'));
  console.log(`saved ${path}`);
  return path;
};

const problems = [];

const sceneState = () =>
  evaluate(`
    (() => {
      const s = window.gemfall.scene.getScene('game');
      if (!s || !s.grid) return { active: false };
      const cells = s.grid.flat().filter(Boolean).length;
      return {
        active: true,
        mode: s.mode,
        difficulty: s.difficulty,
        score: s.score,
        level: s.level,
        movesLeft: Number.isFinite(s.movesLeft) ? s.movesLeft : null,
        busy: s.busy,
        over: s.over,
        paused: s.paused,
        gems: cells,
        sprites: s.spriteOf.size,
        shufflesLeft: Number.isFinite(s.shufflesLeft) ? s.shufflesLeft : null,
      };
    })()
  `);

/**
 * Geometry + hit-area audit for a picker row.
 *
 * `gaps` catches pills that are wide enough to overlap and render as one blob.
 * `widest` catches sub-labels that spill outside their pill.
 * The centre click catches the hit area not being centred on the drawn pill, which made
 * taps land on the neighbouring button.
 */
const pillAudit = (sceneKey) =>
  evaluate(`
    (() => {
      const sc = window.gemfall.scene.getScene('${sceneKey}');
      const rows = {};
      const groups = {
        mode: sc.modePills,
        difficulty: sc.difficultyPills,
        hud: sc.hudPills,
      };
      for (const [group, source] of Object.entries(groups)) {
        if (!source) continue;
        const list = source instanceof Map
          ? [...source.entries()]
          : source.map((pill, i) => [String(i), pill]);
        const boxes = list.map(([name, pill]) => {
          const w = pill.opts.w;
          const texts = pill.list.filter((k) => k.type === 'Text').map((t) => Math.round(t.displayWidth));
          return {
            name,
            cx: pill.x,
            cy: pill.y,
            left: pill.x - w / 2,
            right: pill.x + w / 2,
            w,
            widestText: texts.length ? Math.max(...texts) : 0,
          };
        });
        const gaps = [];
        for (let i = 0; i < boxes.length - 1; i++) gaps.push(+(boxes[i + 1].left - boxes[i].right).toFixed(1));
        rows[group] = { boxes, gaps };
      }
      return rows;
    })()
  `);

// ── menu ──────────────────────────────────────────────────────────────────────

await pump(60);
const menuVisible = await evaluate(`window.gemfall.scene.isActive('menu')`);
console.log('menu active:', menuVisible);
if (!menuVisible) problems.push('menu scene never became active');
await screenshot('menu');

const menuRows = await pillAudit('menu');
for (const [group, row] of Object.entries(menuRows)) {
  const overlapping = row.gaps.filter((g) => g < 8);
  const overflowing = row.boxes.filter((b) => b.widestText > b.w - 16);
  console.log(
    `${group}: boxes=${row.boxes.map((b) => `[${Math.round(b.left)},${Math.round(b.right)}]`).join(' ')} gaps=${JSON.stringify(row.gaps)}`,
  );
  if (overlapping.length) problems.push(`${group} pills overlap (gaps ${JSON.stringify(row.gaps)})`);
  for (const b of overflowing) {
    problems.push(`${group} pill '${b.name}' text overflows (${b.widestText}px in ${b.w}px)`);
  }
}

/** Click a pill by its own declared centre and report what got selected. */
const clickPillAndRead = async (sceneKey, group, name, readExpr) => {
  const centre = await evaluate(`
    (() => {
      const sc = window.gemfall.scene.getScene('${sceneKey}');
      const pill = sc.${group}.get('${name}');
      return pill ? { x: pill.x, y: pill.y } : null;
    })()
  `);
  if (!centre) {
    problems.push(`${group} pill '${name}' not found`);
    return null;
  }
  await click(centre.x, centre.y);
  await pump(20);
  return evaluate(readExpr);
};

const modeRead = `window.gemfall.scene.getScene('menu').mode`;
const difficultyRead = `window.gemfall.scene.getScene('menu').difficulty`;

const chosenMode = await clickPillAndRead('menu', 'modePills', 'moves', modeRead);
console.log(`tapped the centre of 'moves' -> mode='${chosenMode}'`);
if (chosenMode !== 'moves') problems.push(`tapping the centre of the 'moves' pill selected '${chosenMode}'`);

const chosenDifficulty = await clickPillAndRead('menu', 'difficultyPills', 'normal', difficultyRead);
console.log(`tapped the centre of 'normal' -> difficulty='${chosenDifficulty}'`);
if (chosenDifficulty !== 'normal') problems.push(`tapping the centre of the 'normal' pill selected '${chosenDifficulty}'`);

// Also verify the first pill in each row, since the bug made the *right* half of a pill dead.
const chosenFirstMode = await clickPillAndRead('menu', 'modePills', 'endless', modeRead);
if (chosenFirstMode !== 'endless') problems.push(`tapping 'endless' selected '${chosenFirstMode}'`);
const chosenFirstDifficulty = await clickPillAndRead('menu', 'difficultyPills', 'easy', difficultyRead);
if (chosenFirstDifficulty !== 'easy') problems.push(`tapping 'easy' selected '${chosenFirstDifficulty}'`);

// Settle back on the run we actually want to play.
await clickPillAndRead('menu', 'modePills', 'moves', modeRead);
await clickPillAndRead('menu', 'difficultyPills', 'normal', difficultyRead);
console.log('playing: mode=moves difficulty=normal');

// ── start the run ─────────────────────────────────────────────────────────────

const playCentre = await evaluate(`
  (() => {
    const sc = window.gemfall.scene.getScene('menu');
    const pill = sc.children.list.find((o) => o.opts && o.opts.label === 'PLAY');
    return pill ? { x: pill.x, y: pill.y } : { x: 360, y: 576 };
  })()
`);
await click(playCentre.x, playCentre.y);
await pump(120);

await waitFor(`window.gemfall.scene.isActive('game')`, 'game scene to start');
console.log('game started:', await sceneState());
await pump(60);
await screenshot('game-start');

const hudRows = await pillAudit('game');
if (hudRows.hud) {
  console.log(`hud gaps: ${JSON.stringify(hudRows.hud.gaps)}`);
  if (hudRows.hud.gaps.some((g) => g < 8)) problems.push(`hud pills overlap (gaps ${JSON.stringify(hudRows.hud.gaps)})`);
}

// ── play real moves ───────────────────────────────────────────────────────────

let movesPlayed = 0;
for (let attempt = 0; attempt < 10; attempt++) {
  // Ask the game itself for a legal move, then click both of its cells.
  const hint = await evaluate(`
    (() => {
      const s = window.gemfall.scene.getScene('game');
      s.showHint(false);
      return {
        ax: s.hintRingA.x, ay: s.hintRingA.y,
        bx: s.hintRingB.x, by: s.hintRingB.y,
        visible: s.hintRingA.visible,
      };
    })()
  `);

  if (!hint.visible) {
    await pump(30);
    continue;
  }

  await click(hint.ax, hint.ay);
  await pump(6);
  await click(hint.bx, hint.by);

  // Let the cascade play out.
  for (let i = 0; i < 40; i++) {
    await pump(6);
    const state = await sceneState();
    if (!state.busy) break;
  }

  movesPlayed += 1;
  const state = await sceneState();
  console.log(`move ${movesPlayed}: score=${state.score} movesLeft=${state.movesLeft} gems=${state.gems} sprites=${state.sprites}`);

  if (state.over) break;
}

await pump(40);
const finalState = await sceneState();
console.log('final state:', finalState);

const screenshotPath = await screenshot('game-played');

// Persist the ground-truth geometry so the offline PIL checker (analyze-shots.py)
// does not have to guess the canvas mapping back out of pixel data.
const gameGeometry = await evaluate(`
  (() => {
    const s = window.gemfall.scene.getScene('game');
    return { boardX: s.boardX, boardY: s.boardY, cols: s.spec.cols, rows: s.spec.rows, tile: 72 };
  })()
`);
writeFileSync(
  `${OUT_DIR}/geometry.json`,
  JSON.stringify({ canvas: canvasInfo, menu: menuRows, game: gameGeometry }, null, 2),
);
console.log(`saved ${OUT_DIR}/geometry.json`);

// ── verdict ───────────────────────────────────────────────────────────────────

if (!finalState.active) problems.push('game scene never became active');
if (!finalState.score || finalState.score <= 0) problems.push(`score did not increase (${finalState.score})`);
if (movesPlayed < 3) problems.push(`only ${movesPlayed} moves could be played`);
if (finalState.mode !== 'moves') problems.push(`wrong mode: ${finalState.mode}`);
if (finalState.difficulty !== 'normal') problems.push(`wrong difficulty: ${finalState.difficulty}`);
if (finalState.movesLeft === null || finalState.movesLeft > 30 - movesPlayed) {
  problems.push(`move counter did not decrement (${finalState.movesLeft})`);
}
if (finalState.gems !== 64) problems.push(`board is not full (${finalState.gems} gems)`);
if (finalState.sprites !== finalState.gems) problems.push(`sprite/grid mismatch (${finalState.sprites} vs ${finalState.gems})`);
if (consoleErrors.length > 0) problems.push(`browser errors: ${consoleErrors.join(' | ')}`);

console.log('\n--- playtest report ---');
console.log(`screenshots: ${OUT_DIR}/menu.png, ${OUT_DIR}/game-start.png, ${screenshotPath}`);
console.log(`moves played: ${movesPlayed}, score: ${finalState.score}, movesLeft: ${finalState.movesLeft}`);
if (problems.length === 0) {
  console.log('PLAYTEST PASS');
} else {
  console.log('PLAYTEST FAIL');
  for (const problem of problems) console.log(' -', problem);
}

ws.close();
cleanup();
process.exit(problems.length === 0 ? 0 : 1);
