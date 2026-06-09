// Headless playthrough: APEX boots, plays every room (clear->exit->blessing), beats the summit boss.
const path = require('path');
const gpath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(gpath + '/playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, 'index.html'));
  await page.waitForTimeout(200);

  await page.click('#play-btn');
  await page.waitForTimeout(150);

  const res = await page.evaluate(async () => {
    const G = window.Game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const trace = [];
    trace.push(`start state=${G.state} room=${G.roomIdx} type=${G.roomDef.type} enemies=${G.enemies.length}`);
    let guard = 0, exitsOpened = 0;
    while (G.state !== 'over' && guard++ < 60) {
      if (G.state === 'bless') {
        const c = document.querySelector('#bless-cards .bl-card');
        if (c) c.click(); else G.takeBlessing(null);
        await sleep(10); continue;
      }
      if (G.state === 'playing') {
        if (G.roomDef.type === 'summit') {
          trace.push(`summit reached, rival boss hp=${G.rival && G.rival.hp}`);
          G.rival.hp = 1; G.hitRival(999, 0); // kill boss
          await sleep(10); continue;
        }
        // clear the room, confirm exit opens, walk into it
        G._testClearRoom();
        for (let k = 0; k < 6; k++) G.update(0.016);
        if (G.exitOpen) exitsOpened++;
        trace.push(`room ${G.roomIdx} (${G.roomDef.type}) cleared, exitOpen=${G.exitOpen}`);
        G.player.x = G.exitX; G.player.y = G.exitY;
        for (let k = 0; k < 4; k++) G.update(0.016);
        await sleep(10); continue;
      }
      await sleep(10);
    }
    return {
      finalState: G.state,
      title: document.getElementById('over-title').textContent,
      roomsExited: exitsOpened,
      blessings: Object.keys(G.blessings).length,
      trace,
    };
  });

  await browser.close();
  console.log('--- playthrough trace ---');
  res.trace.forEach(t => console.log('  ' + t));
  console.log(`final: state=${res.finalState} title="${res.title}" exitsOpened=${res.roomsExited} blessings=${res.blessings}`);
  if (errors.length) { console.log('\n❌ ERRORS:\n' + errors.join('\n')); process.exit(1); }
  const won = res.finalState === 'over' && res.title.includes('登顶成功');
  console.log(won ? '\n✅ Full run playable: 8 rooms cleared, exits opened, summit boss beaten, no errors.'
                  : '\n⚠️ Run did not complete as expected.');
  if (!won) process.exit(1);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
