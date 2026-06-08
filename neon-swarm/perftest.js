const path = require('path');
const gpath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(gpath + '/playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 414, height: 736 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'index.html'));
  await page.waitForTimeout(200);
  await page.click('#play-btn'); await page.waitForTimeout(100); await page.click('#char-grid .char-card');
  await page.waitForTimeout(200);

  // Force heavy load: spawn lots of enemies + give player strong weapons.
  const result = await page.evaluate(async () => {
    const G = window.Game;
    G.weapons = { pulse: 8, orbit: 8, nova: 8, chain: 8, shotgun: 8, boomerang: 8 };
    // spawn many enemies around player
    for (let i = 0; i < 300; i++) G.spawnEnemy('grunt');
    // measure update() cost across frames
    const samples = [];
    for (let f = 0; f < 120; f++) {
      const t0 = performance.now();
      G.update(0.016);
      samples.push(performance.now() - t0);
      // keep topping up enemies so it stays heavy
      if (G.enemies.length < 250) for (let i = 0; i < 40; i++) G.spawnEnemy('grunt');
    }
    samples.sort((a, b) => a - b);
    const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
    return {
      avg: +avg.toFixed(2),
      p50: +samples[60].toFixed(2),
      p95: +samples[114].toFixed(2),
      max: +samples[119].toFixed(2),
      enemies: G.enemies.length,
      bullets: G.bullets.length,
    };
  });

  await browser.close();
  console.log('Update() cost (ms) under heavy load:', JSON.stringify(result));
  console.log(result.p95 < 8 ? '✅ Comfortably within 60fps budget (16.7ms).' :
              result.p95 < 16 ? '⚠️ OK but watch the budget.' : '❌ Too slow.');
  if (errors.length) { console.log('ERRORS:', errors.join('\n')); process.exit(1); }
})();
