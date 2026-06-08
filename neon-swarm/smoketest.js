// Headless smoke test for NEON SWARM. Loads the game, plays a bit, reports errors.
const path = require('path');
const gpath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(gpath + '/playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 414, height: 736 } });
  const errors = [];
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  const url = 'file://' + path.resolve(__dirname, 'index.html');
  await page.goto(url);
  await page.waitForTimeout(300);

  // Start a run (Play -> pick first pilot)
  await page.click('#play-btn');
  await page.waitForTimeout(120);
  await page.click('#char-grid .char-card');
  await page.waitForTimeout(200);

  // Probe game state
  const state1 = await page.evaluate(() => ({
    state: Game.state,
    hasPlayer: !!Game.player,
    enemies: Game.enemies.length,
  }));

  // Simulate movement via keyboard and let it run to force spawns, combat, level ups
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100);
    // auto-pick first level-up card if visible
    const lu = await page.$('#levelup:not(.hidden) .lu-card');
    if (lu) { await lu.click(); }
  }
  await page.keyboard.up('KeyD');

  const state2 = await page.evaluate(() => ({
    state: Game.state,
    level: Game.player ? Game.player.level : null,
    enemies: Game.enemies.length,
    bullets: Game.bullets.length,
    kills: Game.kills,
    time: Game.time ? Game.time.toFixed(1) : null,
    weapons: Game.weapons,
    hp: Game.player ? Math.round(Game.player.hp) : null,
  }));

  await browser.close();

  console.log('--- STATE after start ---');
  console.log(JSON.stringify(state1));
  console.log('--- STATE after ~3s play ---');
  console.log(JSON.stringify(state2));
  if (logs.length) { console.log('--- console logs ---'); console.log(logs.slice(-20).join('\n')); }
  if (errors.length) {
    console.log('--- ERRORS ---');
    console.log(errors.join('\n'));
    process.exit(1);
  } else {
    console.log('\n✅ No page errors. Smoke test passed.');
  }
})().catch(e => { console.error('TEST HARNESS ERROR:', e); process.exit(2); });
