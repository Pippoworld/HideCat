const path = require('path');
const gpath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(gpath + '/playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const W = parseInt(process.env.SW || '414'), H = parseInt(process.env.SH || '736');
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto('file://' + path.resolve(__dirname, 'index.html'));
  await page.waitForTimeout(300);
  const shots = (process.env.SHOTS || 'menu,play').split(',');
  let i = 0;
  if (shots.includes('menu')) { await page.screenshot({ path: `shot-menu.png` }); }
  if (shots.includes('play')) {
    await page.click('#play-btn');
    const secs = parseInt(process.env.PLAYSECS || '12');
    const seq = ['KeyD', 'KeyS', 'KeyA', 'KeyW']; // circle
    let cur = null;
    for (let s = 0; s < secs * 10; s++) {
      // change direction every ~0.8s to circle around the field
      if (s % 8 === 0) {
        if (cur) await page.keyboard.up(cur);
        cur = seq[(s / 8) % seq.length | 0];
        await page.keyboard.down(cur);
      }
      await page.waitForTimeout(100);
      const lu = await page.$('#levelup:not(.hidden) .lu-card');
      if (lu) await lu.click();
      if (s === parseInt(process.env.SHOTAT || '70')) await page.screenshot({ path: `shot-play.png` });
    }
    if (cur) await page.keyboard.up(cur);
    await page.screenshot({ path: `shot-end.png` });
  }
  await browser.close();
  console.log('done');
})();
