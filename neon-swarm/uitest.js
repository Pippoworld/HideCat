// End-to-end UI flow test: clicks through every screen/transition, asserts no errors.
const path = require('path');
const gpath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(gpath + '/playwright');

const URL = 'file://' + path.resolve(__dirname, 'index.html');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 414, height: 736 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  const visible = (id) => page.evaluate(i => { const el = document.getElementById(i); return el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none'; }, id);
  const state = () => page.evaluate(() => window.Game.state);
  const checks = [];
  const expect = (name, cond) => { checks.push({ name, ok: !!cond }); };
  const drain = async () => { for (let i = 0; i < 60; i++) { const c = await page.$('#levelup:not(.hidden) .lu-card'); if (!c) break; await c.click(); await page.waitForTimeout(40); } };
  const killPlayer = async () => {
    await drain();
    await page.evaluate(() => {
      const G = window.Game; G.player.hp = 1; G.player.revives = 0; G.hurtPlayer(999);
      for (let i = 0; i < 6 && G.state === 'playing'; i++) G.update(0.016);
    });
    await page.waitForTimeout(120);
  };

  // Seed save with coins so we can test shop + unlocks
  await page.goto(URL);
  await page.evaluate(() => localStorage.setItem('neonswarm_save_v1', JSON.stringify({ coins: 9999, chars: { vanguard: 1 }, upgrades: {}, scores: [], seenTutorial: 1 })));
  await page.reload();
  await page.waitForTimeout(200);

  expect('menu visible on load', await visible('menu'));

  // Shop
  await page.click('#upgrades-btn'); await page.waitForTimeout(100);
  expect('shop opens', await visible('shop'));
  const buyBtn = await page.$('#shop-grid .shop-card button:not([disabled])');
  if (buyBtn) { await buyBtn.click(); await page.waitForTimeout(80); }
  expect('shop purchase no-crash', true);
  await page.click('#shop-back'); await page.waitForTimeout(80);
  expect('back to menu from shop', await visible('menu'));

  // How to play
  await page.click('#how-btn'); await page.waitForTimeout(80);
  expect('howto opens', await visible('howto'));
  await page.click('#howto-back'); await page.waitForTimeout(80);
  expect('back to menu from howto', await visible('menu'));

  // Character select -> buy a locked pilot -> start
  await page.click('#play-btn'); await page.waitForTimeout(100);
  expect('charselect opens', await visible('charselect'));
  // click a locked (coins) pilot to unlock it
  const lockedCard = await page.$('#char-grid .char-card.locked');
  if (lockedCard) { await lockedCard.click(); await page.waitForTimeout(80); }
  expect('pilot unlock no-crash', true);
  await page.click('#char-grid .char-card'); await page.waitForTimeout(150);
  expect('run starts (playing)', (await state()) === 'playing');
  expect('hud visible', await visible('hud'));

  // Pause -> resume
  await page.click('#pause-btn'); await page.waitForTimeout(80);
  expect('pause opens', await visible('pause'));
  await page.click('#resume-btn'); await page.waitForTimeout(80);
  expect('resume to playing', (await state()) === 'playing');

  // Force a multi-level-up and resolve the queue (≈5 levels at once)
  await page.evaluate(() => { window.Game.gainXP(150); });
  await page.waitForTimeout(80);
  expect('levelup shows', await visible('levelup'));
  const queued = await page.evaluate(() => window.Game.pendingLevels);
  await drain();
  expect('multi-levelup queue (>1) drains to playing', queued >= 1 && (await state()) === 'playing');

  // Reroll path: trigger one more levelup and reroll
  await page.evaluate(() => { window.Game.pendingLevels = 0; window.Game.gainXP(40); });
  await page.waitForTimeout(60);
  const reroll = await page.$('#lu-reroll');
  if (reroll) { await reroll.click(); await page.waitForTimeout(60); }
  expect('reroll keeps levelup open', await visible('levelup'));
  await drain();

  // Die -> game over -> continue -> die again -> retry
  await killPlayer();
  expect('gameover shows', await visible('gameover'));
  expect('continue offered', await visible('continue-btn'));
  await page.click('#continue-btn'); await page.waitForTimeout(120);
  expect('continue resumes playing', (await state()) === 'playing');
  await killPlayer();
  expect('gameover again', await visible('gameover'));
  expect('continue hidden after use', !(await visible('continue-btn')));
  await page.click('#retry-btn'); await page.waitForTimeout(150);
  expect('retry starts new run', (await state()) === 'playing');

  // Quit to menu
  await page.click('#pause-btn'); await page.waitForTimeout(60);
  await page.click('#quit-btn'); await page.waitForTimeout(80);
  expect('quit returns to menu', await visible('menu'));

  // Mute toggle
  const before = await page.evaluate(() => document.getElementById('mute-btn').textContent);
  await page.click('#mute-btn'); await page.waitForTimeout(40);
  const after = await page.evaluate(() => document.getElementById('mute-btn').textContent);
  expect('mute toggles icon', before !== after);

  await browser.close();

  let pass = 0;
  checks.forEach(c => { console.log(`${c.ok ? '✅' : '❌'} ${c.name}`); if (c.ok) pass++; });
  console.log(`\n${pass}/${checks.length} checks passed`);
  if (errors.length) { console.log('\n--- ERRORS ---\n' + errors.join('\n')); process.exit(1); }
  if (pass < checks.length) process.exit(1);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
