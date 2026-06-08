# NEON SWARM ⚡

A fast, addictive **survivors-style roguelite** for the browser. Dodge the swarm,
auto-fire your weapons, collect XP, level up, and fuse weapons into devastating
evolutions. One more run. Always one more run.

**Pure HTML5 Canvas + vanilla JS. No build step, no dependencies, no assets** —
every visual is generated in code, every sound is synthesized at runtime. Drop it
on any static host and it just works.

---

## ▶ Play

Open `index.html` in any modern browser, or serve the folder:

```bash
cd neon-swarm
python3 -m http.server 8080   # then visit http://localhost:8080
```

- **Move:** WASD / Arrow keys, or drag anywhere on touch (virtual joystick).
- **Everything else is automatic** — your weapons fire on their own. Survive.

Works great on desktop and mobile (responsive canvas, touch controls, installable PWA).

---

## ✨ Features

- **6 weapons** — Pulse Blaster, Orbit Blades, Shock Nova, Tesla Coil, Scatter Gun, Boomerang
- **9 passives** + **6 weapon evolutions** — max a weapon + its paired passive to unlock a super-weapon
- **Banish & reroll** — curate the upgrade pool to craft focused builds
- **5 unlockable pilots**, each with distinct stats and a starting weapon
- **3 difficulty modes** with score multipliers (Easy / Normal / Hard)
- **7 enemy types** (grunt, swift, tank, bomber, splitter, brute, ranged shooter) and **3 boss archetypes** (Charger, Artillery, Summoner)
- **Pickups** — heal, magnet, screen-clearing bomb, and boss supply drops
- **Meta progression** — coins, 10 permanent upgrades, 10 achievements, lifetime stats
- **Daily Challenge** — a seeded daily run with rotating modifiers and its own leaderboard
- **Score, combo multiplier, and a local best-runs leaderboard**
- **Settings & accessibility** — music/SFX volume, screen-shake & damage-number toggles, low-quality mode, reset progress
- **Synthesized audio** (SFX + procedural, intensity-ramping music) — zero audio files

## 🏗 Commercial-readiness

- **Monetization seam** (`js/ads.js`): rewarded continue, interstitials, gameplay hooks — one place to wire Poki/CrazyGames
- **Analytics seam** (`js/analytics.js`): run/evolve/achievement/error events — wire GA4/Plausible/portal
- **Robustness**: crash-resilient game loop, corrupt/partial-save recovery, bounded memory
- **Performance**: spatial-hash collisions, automatic low-end quality scaling, 60fps with 280+ enemies
- **Mobile**: touch joystick, responsive canvas, installable PWA, iOS audio unlock, no PII

---

## 💰 Publishing & monetization

The game is built to be portal-ready. All ad/SDK calls go through a single seam:
**`js/ads.js`**. It ships as no-op stubs; wire your portal's SDK in one place.

Integration notes (Poki, CrazyGames) are documented inline at the top of `js/ads.js`:

- `Ads.gameplayStart()` / `Ads.gameplayStop()` — engagement hooks (wired at run start/stop/pause)
- `Ads.interstitial()` — non-rewarded break, called between runs (retry/menu)
- `Ads.rewarded(tag)` — rewarded break, powers the **"Continue"** revive on game over

Suitable for Poki, CrazyGames, itch.io, GameDistribution, or self-hosting with your
own ad network. Everything is static, so a CDN or GitHub Pages is enough.

---

## 🗂 Structure

```
neon-swarm/
  index.html        # shell: canvas + UI overlays
  style.css         # neon UI styling
  manifest.json     # PWA manifest
  js/
    audio.js        # synthesized WebAudio SFX + procedural music
    ads.js          # monetization seam (portal SDK integration point)
    analytics.js    # telemetry seam (GA4/Plausible/portal)
    input.js        # keyboard + touch joystick
    game.js         # engine: entities, weapons, evolutions, spawning, render
  *.js              # headless Playwright test/scene harnesses (dev only)
```

## 🧪 Dev tooling

Headless harnesses (require a Chromium via Playwright):

```bash
node smoketest.js                 # boots a run, plays, asserts no page errors
node uitest.js                    # 23-check end-to-end UI flow test
node perftest.js                  # update() cost under heavy load (300+ enemies)
node evotest.js                   # validates evolution gating + runtime
node balancetest.js               # an AI plays a full run; prints the difficulty timeline
DIFF=hard PILOT=striker node balancetest.js   # per-difficulty / per-pilot balance
```

---

Built for fun and for shipping. GLHF. 🐝
