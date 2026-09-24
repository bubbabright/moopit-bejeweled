# GEMFALL

An original browser match-3 game — swap gems, build cascades, forge power gems. Built with
Phaser 3 + Vite + TypeScript. No third-party game code or art: the gems, board, UI and sound
effects are all generated procedurally.

Target: a public POC at **`https://bejeweled.moopit.fun`**, listed in the **Fun** section of the
Dashy dashboard at `moopit.fun`. The approved design (modes, scoring, art contract, deployment
steps) lives in [`bejeweled-spec.md`](./bejeweled-spec.md) — that file is the source of truth.

## Playing it right now (POC on this laptop)

```bash
tools/poc.sh start     # builds dist/ then serves it on the LAN
tools/poc.sh status    # show the URLs
tools/poc.sh stop
```

Then open one of:

- <http://localhost:4173/> — same machine
- <http://192.168.1.196:4173/> — any device on the LAN (phone, tablet)

`start` always rebuilds first. `vite preview` serves whatever is in `dist/`, so skipping the
build silently ships stale code — which is how a fixed bug can still look broken in the browser.

## Development

```bash
npm install
npm run dev          # vite dev server on http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run build        # production bundle into dist/
npm run preview      # serve dist/ locally (no rebuild)
```

Requires Node 20+ (developed on Node 24). `netlify.toml` pins `NODE_VERSION = "20"` for CI.

### Controls

| Input | Action |
|---|---|
| Tap/click gem, then a neighbour | Swap (tap the same gem twice to deselect) |
| Drag/swipe toward a neighbour | Swap on release |
| Arrow keys, then Enter/Space | Move the cursor and swap |
| `H` hint · `P`/`Esc` pause · `M` mute · `R` restart | Shortcuts |

### Modes and difficulty

- **Endless** (no limit), **Timed** (60s), **Moves** (30 moves)
- **Easy** 6×6 / 5 gem types · **Normal** 8×8 / 6 · **Hard** 8×8 / 7

Every gameplay tunable — grid sizes, gem counts, scoring, cascade multipliers, level targets,
hint delays, animation timings and the menu layout — is in [`src/config.ts`](./src/config.ts).

High scores per mode/difficulty and the resumable run are stored in `localStorage` under
`bejeweled.highscores.v1`, `bejeweled.savedrun.v1` and `bejeweled.settings.v1`.

## Verification

Three gates, in increasing scope. All three must pass before a change is considered done.

```bash
npm run typecheck    # must be clean
npm run selftest     # engine correctness (headless Chromium)
npm run playtest     # integration: real clicks on a real build
npm run visual       # offline pixel checks on the screenshots
```

**`npm run selftest`** — runs `selftest.html` (which imports the Phaser-free engine in
`src/core/`) in headless Chromium and reads the verdict out of `document.title`. Currently
**67 assertions**: board generation across 60 seeds, match detection, special-gem creation,
detonation chains, gravity/refill, deadlock detection (cross-checked against brute force),
shuffle, storage round-trip plus corrupt-input rejection, scoring, and a 40-turn cascade
simulation. This is the gate for engine logic; it does not touch rendering.

**`npm run playtest [url]`** — drives a real browser over the Chrome DevTools Protocol and
asserts the things unit tests cannot see:

- picker pills do **not** overlap (`gaps`), and no sub-label overflows its pill;
- tapping a pill's own centre selects *that* pill — a regression test for a hit-area bug where
  every button was half-dead and clicks landed one pill to the right;
- the HUD row is evenly spaced;
- a real run: 10 hint-driven moves, score increases, the move counter decrements, the board
  stays full (64 gems, one sprite each), with no console errors.

Pass a URL to test a specific server — this matters, because the default dev server and the
built POC can differ:

```bash
npm run playtest -- http://192.168.1.196:4173   # the shipped build
npm run playtest -- http://127.0.0.1:5173       # the dev server (default)
```

It writes `poc/menu.png`, `poc/game-start.png`, `poc/game-played.png` and `poc/geometry.json`.

**`npm run visual`** — reads those screenshots and `geometry.json` with Pillow and checks what
the playtest cannot assert numerically: the menu really renders as three separated pills aligned
with their hit boxes, and the board really renders 64 occupied cells with 6 distinct gem colours.
It uses the geometry the playtest recorded rather than guessing where the canvas is.

> A WebGL canvas cannot be read back via `drawImage` in headless Chromium, which is why the
> visual gate works on `Page.captureScreenshot` output analysed offline instead.

### Headless gotchas worth knowing

- `requestAnimationFrame` barely ticks in headless Chromium (1–2 frames). The tools drive
  Phaser's loop manually with `game.loop.step()` on a synthetic clock rather than trusting rAF.
- `window.blur` fires on load in headless. Auto-pause is therefore gated behind "ready and the
  player has interacted" so a headless load does not immediately pause the scene.
- `tools/probe-*.mjs` are one-off diagnostics kept for reference (the hit-area and layout probes
  are what localised the two bugs above). They are not part of the gate and not shipped.

## Project layout

```
src/
  config.ts          all tunables + menu layout helpers
  main.ts            Phaser bootstrap, exposes window.gemfall for tests
  core/              Phaser-free engine: board, specials, score, storage, types
  core/selftest.ts   engine test suite (dev only)
  scenes/            BootScene (asset generation), MenuScene, GameScene
  ui/pill.ts         rounded button component (see the hit-area note in it)
  gfx/gems.ts        procedural gem + power-gem textures
  audio/sfx.ts       procedural WebAudio SFX
tools/
  selftest.sh        headless engine suite runner
  playtest.mjs       CDP integration gate
  analyze-shots.py   offline PIL screenshot checks
  poc.sh             build + serve the POC on the LAN
  probe-*.mjs        diagnostic scripts (reference only)
```

## Art and audio

The procedural art is a stand-in for real assets and already matches the final contract in
[spec §7](./bejeweled-spec.md), so artwork can be dropped in **without code changes**:

- `assets/gems.png` — 64×64 cells, 7 columns × 4 rows (normal, line blaster, bomb, hypercube),
  frames named `gem_<colour>`, `special_line_<colour>`, `special_bomb_<colour>`, `special_hyper`.
- Optional `assets/gems@2x.png` at 128×128 cells for retina.
- Audio overrides go in `assets/sfx/*.ogg`, keyed by the same event names as the procedural
  engine. No audio files ship today; all sound is synthesised with WebAudio.

## Deploying (follow-on, not done yet)

The site is not deployed. When it is, per spec §9:

1. Push the repo; Netlify builds with `npm run build` and publishes `dist/`.
2. DNS: add a `bejeweled` CNAME pointing at the Netlify subdomain. Netlify provisions the
   Let's Encrypt certificate automatically. No Cloudflare proxy or Access gate — matching how
   the tetris and snake sites are exposed.
3. Add the Dashy tile in the **Fun** section of `/srv/dashy/user-data/conf.yml`
   (`title: Bejeweled`, `url: https://bejeweled.moopit.fun/`, `target: newtab`,
   icon `fa-gem`, `statusCheck: false`), then restart the Dashy container. Back `conf.yml` up
   first, as `conf.yml.bak-<timestamp>-pre-bejeweled`.

Caching headers in `netlify.toml` are already set: hashed assets are `immutable`, `index.html`
is `must-revalidate`.
