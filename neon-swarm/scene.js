const path = require('path');
const gpath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(gpath + '/playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 414, height: 736 } });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto('file://' + path.resolve(__dirname, 'index.html'));
  await page.waitForTimeout(200);
  await page.click('#play-btn');
  await page.waitForTimeout(100);
  await page.evaluate(async () => {
    const G = window.Game;
    G.weapons = { pulse: 4, orbit: 3, nova: 2 };
    G.player.level = 12;
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 80 + Math.random() * 320;
      const t = ['grunt', 'swift', 'tank', 'bomber'][Math.random() * 4 | 0];
      const def = window.Game; // noop
      G.spawnEnemy(t);
      const e = G.enemies[G.enemies.length - 1];
      e.x = G.player.x + Math.cos(a) * d;
      e.y = G.player.y + Math.sin(a) * d;
    }
    for (let f = 0; f < 40; f++) G.update(0.016);
  });
  await page.waitForTimeout(60);
  await page.screenshot({ path: 'shot-scene.png' });
  await browser.close();
  console.log('done');
})();
