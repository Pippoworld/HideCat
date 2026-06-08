const path = require('path');
const gpath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(gpath + '/playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 414, height: 736 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'index.html'));
  await page.waitForTimeout(150);
  await page.click('#play-btn');
  await page.waitForTimeout(100);

  const r = await page.evaluate(() => {
    const G = window.Game;
    // set up a build that should be evolve-ready for pulse (haste) + nova (might)
    G.weapons = { pulse: 5, nova: 5, orbit: 5, chain: 5, shotgun: 5, boomerang: 5 };
    G.passives = { haste: 3, might: 3, area: 3, crit: 3, magnet: 3, swift: 3 };
    const ready = {};
    for (const id of ['pulse', 'nova', 'orbit', 'chain', 'shotgun', 'boomerang']) ready[id] = G.isEvolveReady(id);
    // force a roll and check evolutions appear
    const choices = G.rollChoices().map(c => c.kind + (c.id ? ':' + c.id : ''));
    // evolve pulse and run frames with enemies to make sure no errors
    G.evolved = {}; G.chooseUpgrade({ kind: 'evolve', id: 'pulse' });
    G.chooseUpgrade && (G.state = 'playing');
    G.evolved.nova = true; G.evolved.orbit = true; G.evolved.chain = true;
    G.evolved.shotgun = true; G.evolved.boomerang = true;
    for (let i = 0; i < 80; i++) G.spawnEnemy('grunt');
    for (let f = 0; f < 60; f++) { G.update(0.016); if (G.enemies.length < 40) for (let i = 0; i < 30; i++) G.spawnEnemy('grunt'); }
    return { ready, choices, evolved: G.evolved, enemies: G.enemies.length, bullets: G.bullets.length, booms: G.booms.length };
  });
  await browser.close();
  console.log('evolve-ready:', JSON.stringify(r.ready));
  console.log('rolled choices:', JSON.stringify(r.choices));
  console.log('evolved state:', JSON.stringify(r.evolved));
  console.log('post-run:', `enemies=${r.enemies} bullets=${r.bullets} booms=${r.booms}`);
  if (errors.length) { console.log('❌ ERRORS:\n' + errors.join('\n')); process.exit(1); }
  const allReady = Object.values(r.ready).every(Boolean);
  const hasEvoChoice = r.choices.some(c => c.startsWith('evolve'));
  console.log(allReady && hasEvoChoice ? '✅ Evolutions trigger and run cleanly.' : '⚠️ Check evolution gating.');
})();
