// Headless balance simulation: a dodging AI plays a full run; reports the timeline.
const path = require('path');
const gpath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(gpath + '/playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 414, height: 736 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'index.html'));
  const diff = process.env.DIFF || 'normal';
  const pilots = ['vanguard', 'striker', 'warden', 'sprinter', 'tempest'];
  const pilotIdx = Math.max(0, pilots.indexOf(process.env.PILOT || 'vanguard'));
  await page.evaluate((d) => { try { const s = JSON.parse(localStorage.getItem('neonswarm_save_v1') || '{}'); s.difficulty = d; s.seenTutorial = 1; s.chars = { vanguard: 1, striker: 1, warden: 1, sprinter: 1, tempest: 1 }; localStorage.setItem('neonswarm_save_v1', JSON.stringify(s)); } catch (e) {} }, diff);
  await page.reload();
  await page.waitForTimeout(150);
  await page.click('#play-btn');
  await page.waitForTimeout(80);
  await page.click(`#char-grid .char-card:nth-child(${pilotIdx + 1})`);
  await page.waitForTimeout(120);

  const report = await page.evaluate(async () => {
    const G = window.Game;
    const I = window.Input;
    // --- dodge AI: sample directions, move toward the safest (most open) one ---
    const DIRS = [];
    for (let i = 0; i < 16; i++) DIRS.push({ x: Math.cos(i / 16 * 6.283), y: Math.sin(i / 16 * 6.283) });
    I.getMove = () => {
      const p = G.player;
      let best = null, bestScore = -1e9;
      for (const d of DIRS) {
        const px = p.x + d.x * 36, py = p.y + d.y * 36;
        let nearest = 1e9;
        G.forEachNear(px, py, 300, (e) => {
          const dd = (px - e.x) * (px - e.x) + (py - e.y) * (py - e.y);
          if (dd < nearest) nearest = dd;
        });
        // also avoid incoming enemy projectiles
        for (const eb of G.enemyBullets) {
          const dd = (px - eb.x) * (px - eb.x) + (py - eb.y) * (py - eb.y);
          if (dd < nearest) nearest = dd * 0.8;
        }
        const nd = Math.sqrt(nearest);
        // realistic player: flee hard when truly threatened, otherwise hold ~180px
        // from the nearest threat — inside XP soft-pull range but with dodge room
        const score = nd < 60 ? nd * 2 : -Math.abs(nd - 180);
        if (score > bestScore) { bestScore = score; best = d; }
      }
      return best || { x: 1, y: 0 };
    };
    // --- upgrade strategy: focus pulse + haste to force an evolution, else broaden ---
    function autoPick() {
      const ch = G._luChoices || [];
      const w = G.weapons || {};
      const order = (c) => {
        if (c.kind === 'evolve') return 0;
        if (c.kind === 'weapon' && c.id === 'pulse') return 1;     // focus pulse
        if (c.kind === 'passive' && c.id === 'haste') return 2;    // enables pulse evo
        if (c.kind === 'weapon' && (c.id === 'nova' || c.id === 'orbit')) return 3; // AoE clear
        if (c.kind === 'passive' && (c.id === 'might' || c.id === 'area')) return 4;
        if (c.kind === 'weapon' && w[c.id]) return 5;              // level existing
        if (c.kind === 'passive' && (c.id === 'vigor' || c.id === 'regen')) return 6;
        if (c.kind === 'weapon') return 7;
        return 8;
      };
      const best = ch.slice().sort((a, b) => order(a) - order(b))[0];
      if (best) G.chooseUpgrade(best);
    }

    const dt = 1 / 60;
    const maxSec = 600; // simulate up to 10 minutes
    const timeline = [];
    let nextSample = 0;
    let frames = 0;
    while (G.state === 'playing' || G.state === 'levelup') {
      if (G.state === 'levelup') { autoPick(); continue; }
      G.update(dt);
      frames++;
      if (G.time >= nextSample) {
        nextSample += 30;
        timeline.push({
          t: Math.round(G.time), lv: G.player.level, hp: Math.round(G.player.hp),
          maxHp: G.player.maxHp, en: G.enemies.length, kills: G.kills,
          bul: G.bullets.length, gems: G.gems.length, st: G.state,
          evo: Object.keys(G.evolved || {}).length,
        });
      }
      if (G.time >= maxSec) break;
      if (frames > 60 * (maxSec + 5)) break;
    }
    return {
      dead: G.state === 'gameover',
      survived: Math.round(G.time),
      level: G.player.level,
      kills: G.kills,
      coins: G.runCoins,
      weapons: G.weapons,
      evolved: G.evolved,
      timeline,
    };
  });

  await browser.close();
  console.log('=== BALANCE RUN (dodging AI) ===');
  console.log(`outcome: ${report.dead ? 'DIED' : 'survived cap'} @ ${report.survived}s | level ${report.level} | ${report.kills} kills | ◈${report.coins}`);
  console.log('weapons:', JSON.stringify(report.weapons), 'evolved:', JSON.stringify(report.evolved));
  console.log('t(s)  lv  hp/max     enemies kills evo');
  console.log('t(s)  lv  hp/max     en  kills  bul gems st');
  report.timeline.forEach(s => {
    console.log(`${String(s.t).padStart(4)}  ${String(s.lv).padStart(2)}  ${String(s.hp).padStart(4)}/${String(s.maxHp).padEnd(4)}  ${String(s.en).padStart(3)}  ${String(s.kills).padStart(5)}  ${String(s.bul).padStart(3)} ${String(s.gems).padStart(3)} ${s.st}`);
  });
  if (errors.length) { console.log('❌ ERRORS:\n' + errors.join('\n')); process.exit(1); }
})();
