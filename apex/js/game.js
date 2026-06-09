// APEX · 绝巅 — top-down action roguelite (reverse-Hades climb). Pure canvas, no assets.
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % TAU) - Math.PI; return a + d * t; };
  const fmtT = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); };

  // ---------------- save ----------------
  const SAVE = 'apex_save_v1';
  const Meta = {
    data: { wins: 0, runs: 0, bestRoom: 0 },
    load() { try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s) Object.assign(this.data, s); } catch (e) {} },
    save() { try { localStorage.setItem(SAVE, JSON.stringify(this.data)); } catch (e) {} },
  };

  // ---------------- blessings (pure buffs, stack) ----------------
  const BLESSINGS = {
    swift:  { ic: '🌪️', nm: '疾风',  ds: '+12% 移动速度',           max: 5, apply: p => p.speedMul += 0.12 },
    might:  { ic: '💪', nm: '巨力',  ds: '+25% 攻击伤害',           max: 5, apply: p => p.dmgMul += 0.25 },
    haste:  { ic: '⚡', nm: '连击',  ds: '+20% 攻击速度',           max: 5, apply: p => p.atkRateMul *= 0.83 },
    flame:  { ic: '🔥', nm: '烈焰',  ds: '攻击附带灼烧',             max: 3, apply: p => p.burn += 1 },
    leech:  { ic: '🩸', nm: '嗜血',  ds: '命中回复 2 点生命',       max: 4, apply: p => p.leech += 2 },
    bolt:   { ic: '🏹', nm: '远射',  ds: '挥砍同时射出穿透箭',       max: 4, apply: p => p.bolt += 1 },
    gale:   { ic: '🌬️', nm: '罡风',  ds: '攻击范围更大、击退更强',   max: 3, apply: p => { p.arc += 0.18; p.knock += 120; } },
    shield: { ic: '🛡️', nm: '护盾',  ds: '+1 格护盾（挡伤后回充）',  max: 3, apply: p => p.shieldMax += 1 },
    dash:   { ic: '💨', nm: '疾影',  ds: '+1 次冲刺、回充更快',     max: 3, apply: p => { p.dashMax += 1; p.dashCd *= 0.82; } },
    chain:  { ic: '🔗', nm: '雷链',  ds: '命中弹射到附近敌人',       max: 3, apply: p => p.chain += 1 },
    regen:  { ic: '🌿', nm: '回春',  ds: '+0.6 生命/秒',            max: 4, apply: p => p.regen += 0.6 },
    vigor:  { ic: '❤️', nm: '坚韧',  ds: '+25 最大生命并治疗',      max: 5, apply: p => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  };

  // ---------------- room sequence (fixed skeleton, Hades-style) ----------------
  // type: pve | rival (non-lethal skirmish) | summit (lethal boss + storm)
  const STAGES = {
    foot: { nm: '山脚', floor: '#2a2333', wall: '#4a3d5c', accent: '#6b5a82' },
    mid:  { nm: '山腰', floor: '#26303a', wall: '#3d4f5e', accent: '#5a7488' },
    high: { nm: '临顶', floor: '#332430', wall: '#5c3d52', accent: '#86566f' },
    peak: { nm: '山顶', floor: '#1a2438', wall: '#3a4a72', accent: '#6f86c0' },
  };
  const ROOMS = [
    { stage: 'foot', type: 'pve',    spawns: [['charger', 3]] },
    { stage: 'foot', type: 'pve',    spawns: [['charger', 3], ['spitter', 1]] },
    { stage: 'mid',  type: 'rival',  spawns: [['charger', 2]] },
    { stage: 'mid',  type: 'pve',    spawns: [['charger', 3], ['brute', 1]] },
    { stage: 'mid',  type: 'pve',    spawns: [['charger', 2], ['spitter', 2]] },
    { stage: 'high', type: 'pve',    spawns: [['brute', 1], ['spitter', 2], ['charger', 2]] },
    { stage: 'high', type: 'rival',  spawns: [['spitter', 1], ['charger', 2]] },
    { stage: 'peak', type: 'summit', spawns: [] },
  ];

  const ENEMY = {
    charger: { hp: 30, r: 16, speed: 96, dmg: 10, color: '#ff6b6b', shape: 'tri' },
    spitter: { hp: 24, r: 15, speed: 64, dmg: 8, color: '#ffd34d', shape: 'diamond', ranged: true },
    brute:   { hp: 95, r: 26, speed: 58, dmg: 16, color: '#c084fc', shape: 'hex' },
  };

  // ---------------- entities ----------------
  class Player {
    constructor() {
      this.x = 0; this.y = 0; this.r = 16;
      this.maxHp = 100; this.hp = 100;
      this.baseSpeed = 250; this.facing = 0;
      this.vx = 0; this.vy = 0;
      // dash
      this.dashMax = 2; this.dashCharges = 2; this.dashCd = 1.0; this.dashTimers = [];
      this.dashing = 0; this.iframe = 0; this.dashDir = 0;
      // attack
      this.atkCd = 0; this.atkRate = 0.34; this.arc = 0.9; this.reach = 56;
      // stats from blessings
      this.speedMul = 1; this.dmgMul = 1; this.atkRateMul = 1;
      this.burn = 0; this.leech = 0; this.bolt = 0; this.knock = 0;
      this.shieldMax = 0; this.shield = 0; this.shieldTimer = 0;
      this.chain = 0; this.regen = 0;
      this.hitFlash = 0; this.invulnSpawn = 0;
    }
    get speed() { return this.baseSpeed * this.speedMul; }
  }

  const Game = {
    canvas: null, ctx: null, W: 0, H: 0, DPR: 1,
    state: 'menu',
    player: null,
    room: { x: 0, y: 0, w: 0, h: 0 },
    roomIdx: 0, roomDef: null, stage: null,
    enemies: [], pbullets: [], ebullets: [], slashes: [], particles: [], texts: [],
    rival: null,
    exitOpen: false, exitX: 0, exitY: 0, cleared: false, spawnLeft: 0,
    roomTime: 0, roomLimit: 0,
    storm: null, // {r, cx, cy} for summit
    blessings: {},
    lastT: 0, paused: false,
    _eid: 0,

    init() {
      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d');
      Meta.load();
      Input.init(this.canvas);
      this.resize();
      window.addEventListener('resize', () => this.resize());
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.togglePause(); });
      window.addEventListener('keydown', (e) => { if ((e.code === 'Escape' || e.code === 'KeyP') && (this.state === 'playing' || this.state === 'pause')) { e.preventDefault(); this.togglePause(); } });
      this.wireUI();
      this.showMenu();
      requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.DPR = dpr; this.W = window.innerWidth; this.H = window.innerHeight;
      this.canvas.width = Math.floor(this.W * dpr); this.canvas.height = Math.floor(this.H * dpr);
      this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.layoutRoom();
    },

    layoutRoom() {
      const margin = Math.min(60, this.W * 0.06);
      const topUI = 96, botUI = 30;
      this.room.x = margin;
      this.room.y = topUI;
      this.room.w = this.W - margin * 2;
      this.room.h = this.H - topUI - botUI;
    },

    wireUI() {
      const $ = (id) => document.getElementById(id);
      $('play-btn').onclick = () => { Sound.init(); Sound.resume(); this.startRun(); };
      $('how-btn').onclick = () => { this.hideAll(); $('howto').classList.remove('hidden'); };
      $('howto-back').onclick = () => this.showMenu();
      $('pause-btn').onclick = () => this.togglePause();
      $('resume-btn').onclick = () => this.togglePause();
      $('quit-btn').onclick = () => { this.state = 'menu'; this.showMenu(); };
      $('retry-btn').onclick = () => this.startRun();
      $('menu-btn').onclick = () => this.showMenu();
      $('touch-dash').onclick = () => { Input.dashQueued = true; };
    },

    hideAll() { ['menu', 'bless', 'pause', 'over', 'howto'].forEach(id => document.getElementById(id).classList.add('hidden')); document.getElementById('hud').classList.add('hidden'); },

    showMenu() {
      this.state = 'menu'; Sound.stopMusic && Sound.stopMusic(); this.hideAll();
      document.getElementById('menu').classList.remove('hidden');
      const d = Meta.data;
      document.getElementById('best-line').textContent = d.runs ? `登顶 ${d.wins} 次 · 最远到第 ${d.bestRoom + 1} 间` : '';
    },

    // ---------------- run lifecycle ----------------
    startRun() {
      Sound.init(); Sound.resume();
      this.hideAll();
      document.getElementById('hud').classList.remove('hidden');
      document.getElementById('touch-dash').classList.toggle('hidden', !Input.isTouch);
      this.state = 'playing';
      this.player = new Player();
      this.blessings = {};
      this.roomIdx = 0;
      this.rival = null;
      Meta.data.runs++; Meta.save();
      this.enterRoom(0);
      Sound.startMusic && Sound.startMusic(0);
    },

    enterRoom(idx) {
      this.roomIdx = idx;
      const def = ROOMS[idx];
      this.roomDef = def;
      this.stage = STAGES[def.stage];
      this.enemies = []; this.pbullets = []; this.ebullets = []; this.slashes = []; this.particles = []; this.texts = [];
      this.exitOpen = false; this.cleared = false;
      this.storm = null; this.rival = null;
      // place player at bottom-center (entrance)
      const r = this.room;
      this.player.x = r.x + r.w / 2;
      this.player.y = r.y + r.h - 60;
      this.player.vx = this.player.vy = 0;
      this.player.invulnSpawn = 1.2;
      this.entranceX = this.player.x; this.entranceY = this.player.y;
      this.exitX = r.x + r.w / 2; this.exitY = r.y + 50;

      // touch dash button visibility
      document.getElementById('touch-dash').classList.toggle('hidden', !Input.isTouch);
      document.getElementById('rival-bar-wrap').classList.add('hidden');

      if (def.type === 'summit') {
        this.roomLimit = 0; this.roomTime = 0;
        this.spawnSummit();
      } else {
        this.roomLimit = 26 + idx * 2; this.roomTime = this.roomLimit;
        // spawn enemies
        let total = 0;
        for (const [type, n] of def.spawns) { for (let i = 0; i < n; i++) this.spawnEnemy(type); total += n; }
        this.spawnLeft = 0;
        if (def.type === 'rival') this.spawnRivalHarasser();
      }
      this.banner(this.stage.nm + ' · 第 ' + (idx + 1) + ' 间');
    },

    spawnEnemy(type) {
      const d = ENEMY[type]; const r = this.room;
      // spawn around top area, away from player
      const x = r.x + rand(40, r.w - 40);
      const y = r.y + rand(40, r.h * 0.45);
      this.enemies.push({
        id: ++this._eid, type, x, y, r: d.r,
        hp: d.hp, maxHp: d.hp, speed: d.speed, dmg: d.dmg, color: d.color, shape: d.shape,
        ranged: d.ranged, atkCd: rand(0.5, 1.5), flash: 0, burn: 0, burnT: 0, kx: 0, ky: 0, lunge: 0, tele: 0,
      });
    },

    // ---------------- rival ----------------
    spawnRivalHarasser() {
      const r = this.room;
      this.rival = {
        x: r.x + r.w / 2, y: r.y + 60, r: 20, hp: 9999, maxHp: 9999, // can't be killed; "knocked down" instead
        kdHp: 120, kdMax: 120, speed: 150, dmg: 8, mode: 'harass', kx: 0, ky: 0,
        atkCd: 1.2, down: 0, flash: 0, boss: false, color: '#c8a4ff',
      };
      document.getElementById('rival-bar-wrap').classList.remove('hidden');
      document.getElementById('rival-name').textContent = '宿敌（击倒不可杀）';
    },

    spawnSummit() {
      const r = this.room;
      this.rival = {
        x: r.x + r.w / 2, y: r.y + 80, r: 28,
        hp: 600, maxHp: 600, speed: 130, dmg: 16, mode: 'boss', boss: true,
        atkCd: 1.6, teleCd: 4, summonCd: 6, flash: 0, kx: 0, ky: 0, color: '#c8a4ff',
      };
      document.getElementById('rival-bar-wrap').classList.remove('hidden');
      document.getElementById('rival-name').textContent = '⚔ 宿敌 · 最终决斗';
      // shrinking storm
      this.storm = { cx: r.x + r.w / 2, cy: r.y + r.h / 2, r: Math.hypot(r.w, r.h) / 2, min: 120, t: 0 };
      this.banner('⚔ 山顶决斗！风暴将至');
    },

    // ---------------- loop ----------------
    loop(t) {
      const raw = (t - this.lastT) / 1000 || 0;
      const dt = Math.min(0.033, raw);
      this.lastT = t;
      try {
        if (this.state === 'playing') this.update(dt);
        this.render();
      } catch (e) { if ((this._err = (this._err || 0) + 1) <= 3) console.error('APEX loop error:', e); }
      requestAnimationFrame((tt) => this.loop(tt));
    },

    update(dt) {
      const p = this.player, r = this.room;

      // timers
      if (p.iframe > 0) p.iframe -= dt;
      if (p.dashing > 0) p.dashing -= dt;
      if (p.invulnSpawn > 0) p.invulnSpawn -= dt;
      if (p.hitFlash > 0) p.hitFlash -= dt;
      if (p.atkCd > 0) p.atkCd -= dt;
      if (p.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
      // shield regen
      if (p.shieldMax > 0 && p.shield < p.shieldMax) { p.shieldTimer -= dt; if (p.shieldTimer <= 0) { p.shield++; p.shieldTimer = 4; } }
      // dash recharge
      for (let i = p.dashTimers.length - 1; i >= 0; i--) { p.dashTimers[i] -= dt; if (p.dashTimers[i] <= 0) { p.dashTimers.splice(i, 1); p.dashCharges = Math.min(p.dashMax, p.dashCharges + 1); } }

      // aim
      const aim = Input.aimAngle(p.x, p.y);
      let aimAng;
      if (aim !== null) aimAng = aim;
      else { const e = this.nearestEnemy(p.x, p.y); if (e) aimAng = Math.atan2(e.y - p.y, e.x - p.x); else aimAng = p.facing; }

      // movement
      const mv = Input.getMove();
      if (p.dashing > 0) {
        p.x += Math.cos(p.dashDir) * 620 * dt;
        p.y += Math.sin(p.dashDir) * 620 * dt;
        if (Math.random() < 0.6) this.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, max: 0.25, r: 7, c: '#9b7bd4', kind: 'fade' });
      } else {
        if (mv.x || mv.y) { p.facing = Math.atan2(mv.y, mv.x); }
        p.x += mv.x * p.speed * dt; p.y += mv.y * p.speed * dt;
      }
      // dash trigger
      if (Input.consumeDash() && p.dashing <= 0 && p.dashCharges > 0) {
        p.dashCharges--; p.dashTimers.push(p.dashCd);
        p.dashing = 0.16; p.iframe = 0.30;
        p.dashDir = (mv.x || mv.y) ? Math.atan2(mv.y, mv.x) : aimAng;
        Sound.dash && Sound.dash();
      }
      // clamp to room
      p.x = clamp(p.x, r.x + p.r, r.x + r.w - p.r);
      p.y = clamp(p.y, r.y + p.r, r.y + r.h - p.r);
      if (aim !== null && p.dashing <= 0) p.facing = aimAng;

      // attack
      if (Input.wantAttack() && p.atkCd <= 0 && p.dashing <= 0) {
        this.doAttack(aimAng);
        p.atkCd = p.atkRate * p.atkRateMul;
      }

      // entities
      this.updateEnemies(dt);
      this.updateRival(dt);
      this.updatePBullets(dt);
      this.updateEBullets(dt);
      this.updateSlashes(dt);
      this.updateParticles(dt);
      this.updateTexts(dt);

      // room timer (pressure)
      if (this.roomDef.type !== 'summit') {
        if (this.roomTime > 0) this.roomTime -= dt;
        else if (!this.cleared) {
          // gentle pressure: chip damage to push player on
          if (p.iframe <= 0 && p.invulnSpawn <= 0 && Math.random() < dt * 0.8) this.hurt(2, true);
        }
      }

      // storm (summit)
      if (this.storm) {
        this.storm.t += dt;
        this.storm.r = Math.max(this.storm.min, this.storm.r - 14 * dt);
        const d = Math.hypot(p.x - this.storm.cx, p.y - this.storm.cy);
        if (d > this.storm.r && p.iframe <= 0) this.hurt(14 * dt, true); // lethal DoT outside
      }

      // clear detection (robust): non-summit room cleared when all enemies dead and rival not blocking
      if (!this.cleared && this.roomDef.type !== 'summit') {
        const rivalBlocking = this.rival && this.rival.mode === 'harass' && this.rival.down <= 0 && this.roomTime > 0;
        if (this.enemies.length === 0 && !rivalBlocking) this.openExit();
      }

      // exit reached
      if (this.exitOpen && dist2(p.x, p.y, this.exitX, this.exitY) < 34 * 34) this.advance();

      // death
      if (p.hp <= 0) this.onDeath();

      this.updateHUD();
    },

    // ---------------- player attack ----------------
    doAttack(ang) {
      const p = this.player;
      Sound.swing && Sound.swing();
      this.slashes.push({ x: p.x, y: p.y, ang, life: 0.16, max: 0.16, reach: p.reach + (p.gale || 0), arc: p.arc });
      const reach = p.reach; const arc = p.arc;
      const dmg = 14 * p.dmgMul;
      // melee cone
      for (const e of this.enemies) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < reach + e.r) {
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          let da = Math.abs(((a - ang + Math.PI) % TAU) - Math.PI);
          if (da < arc) this.hitEnemy(e, dmg, ang);
        }
      }
      // rival melee hit (harasser knockdown / boss damage)
      if (this.rival && (this.rival.down || 0) <= 0) {
        const rv = this.rival; const d = Math.hypot(rv.x - p.x, rv.y - p.y);
        if (d < reach + rv.r) {
          const a = Math.atan2(rv.y - p.y, rv.x - p.x);
          let da = Math.abs(((a - ang + Math.PI) % TAU) - Math.PI);
          if (da < arc) this.hitRival(dmg, ang);
        }
      }
      // bolt blessing: piercing projectile(s)
      for (let i = 0; i < p.bolt; i++) {
        const spread = (i - (p.bolt - 1) / 2) * 0.12;
        this.pbullets.push({ x: p.x, y: p.y, vx: Math.cos(ang + spread) * 560, vy: Math.sin(ang + spread) * 560, r: 6, dmg: dmg * 0.8, life: 0.8, pierce: 3, hit: {} });
      }
    },

    hitEnemy(e, dmg, ang) {
      const p = this.player;
      e.hp -= dmg; e.flash = 0.08;
      if (p.knock) { e.kx += Math.cos(ang) * p.knock; e.ky += Math.sin(ang) * p.knock; }
      if (p.burn) { e.burn = p.burn; e.burnT = 2.5; }
      if (p.leech) { p.hp = Math.min(p.maxHp, p.hp + p.leech); }
      this.dmgText(e.x, e.y - e.r, Math.round(dmg));
      this.particles.push({ x: e.x, y: e.y, vx: rand(-60, 60), vy: rand(-60, 60), life: 0.25, max: 0.25, r: 3, c: e.color, kind: 'spark' });
      // chain
      if (p.chain && !e._chained) { this.chainFrom(e, dmg * 0.6, p.chain); }
      if (e.hp <= 0) this.killEnemy(e);
    },

    chainFrom(src, dmg, jumps) {
      let from = src; const hit = { [src.id]: 1 };
      for (let j = 0; j < jumps; j++) {
        let best = null, bd = 200 * 200;
        for (const e of this.enemies) { if (hit[e.id]) continue; const dd = dist2(from.x, from.y, e.x, e.y); if (dd < bd) { bd = dd; best = e; } }
        if (!best) break;
        hit[best.id] = 1; best._chained = true;
        this.particles.push({ x: best.x, y: best.y, vx: 0, vy: 0, life: 0.15, max: 0.15, r: 4, c: '#9af6ff', kind: 'spark', bolt: [from.x, from.y, best.x, best.y] });
        best.hp -= dmg; best.flash = 0.08; this.dmgText(best.x, best.y - best.r, Math.round(dmg));
        if (best.hp <= 0) this.killEnemy(best);
        from = best;
      }
      setTimeout(() => { for (const e of this.enemies) e._chained = false; }, 0);
    },

    killEnemy(e) {
      const i = this.enemies.indexOf(e); if (i < 0) return;
      this.enemies.splice(i, 1);
      Sound.kill && Sound.kill();
      for (let k = 0; k < 8; k++) this.particles.push({ x: e.x, y: e.y, vx: rand(-140, 140), vy: rand(-140, 140), life: rand(0.25, 0.5), max: 0.5, r: rand(2, 4), c: e.color, kind: 'spark' });
    },

    hitRival(dmg, ang) {
      const rv = this.rival;
      rv.flash = 0.08;
      if (rv.boss) {
        rv.hp -= dmg; this.dmgText(rv.x, rv.y - rv.r, Math.round(dmg));
        if (rv.hp <= 0) this.winRun();
      } else {
        rv.kdHp -= dmg; this.dmgText(rv.x, rv.y - rv.r, Math.round(dmg));
        rv.kx += Math.cos(ang) * 60; rv.ky += Math.sin(ang) * 60;
        if (rv.kdHp <= 0) { // knocked down — leaves, room can clear
          rv.down = 99; rv.kdHp = rv.kdMax;
          this.banner('宿敌被击退！');
          this.particles.push({ x: rv.x, y: rv.y, vx: 0, vy: 0, life: 0.4, max: 0.4, r: 30, c: '#c8a4ff', kind: 'fade' });
        }
      }
    },

    // ---------------- enemies ----------------
    updateEnemies(dt) {
      const p = this.player, r = this.room;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.flash > 0) e.flash -= dt;
        if (e.atkCd > 0) e.atkCd -= dt;
        // burn
        if (e.burn > 0 && e.burnT > 0) { e.burnT -= dt; e.hp -= e.burn * 6 * dt; if (Math.random() < dt * 6) this.particles.push({ x: e.x + rand(-6, 6), y: e.y - 6, vx: 0, vy: -30, life: 0.3, max: 0.3, r: 3, c: '#ff7a3c', kind: 'fade' }); if (e.hp <= 0) { this.killEnemy(e); continue; } }
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
        if (e.ranged) {
          // keep distance and shoot
          const want = 210;
          let mv = d > want + 40 ? 1 : (d < want - 40 ? -0.7 : 0);
          e.x += dx / d * e.speed * mv * dt; e.y += dy / d * e.speed * mv * dt;
          e.x += -dy / d * e.speed * 0.3 * dt; e.y += dx / d * e.speed * 0.3 * dt;
          if (e.atkCd <= 0 && d < 460) { this.ebullets.push({ x: e.x, y: e.y, vx: dx / d * 240, vy: dy / d * 240, r: 7, dmg: e.dmg, life: 3 }); e.atkCd = 1.9; }
        } else {
          // charge; brute slower
          e.x += dx / d * e.speed * dt + e.kx * dt; e.y += dy / d * e.speed * dt + e.ky * dt;
        }
        e.kx *= 0.86; e.ky *= 0.86;
        e.x = clamp(e.x, r.x + e.r, r.x + r.w - e.r); e.y = clamp(e.y, r.y + e.r, r.y + r.h - e.r);
        // touch damage
        if (d < e.r + p.r && e.atkCd <= 0 && !e.ranged) { this.hurt(e.dmg); e.atkCd = 0.8; }
      }
    },

    updateRival(dt) {
      const rv = this.rival; if (!rv) return; const p = this.player, r = this.room;
      if (rv.flash > 0) rv.flash -= dt;
      if (rv.down > 0) { rv.down -= dt; return; } // knocked down, inert
      const dx = p.x - rv.x, dy = p.y - rv.y, d = Math.hypot(dx, dy) || 1;
      rv.atkCd -= dt;
      if (rv.mode === 'harass') {
        // circle the player, occasional lunge, non-lethal contact
        const ang = Math.atan2(dy, dx) + 0.6;
        const want = 90;
        if (d > want) { rv.x += dx / d * rv.speed * dt; rv.y += dy / d * rv.speed * dt; }
        else { rv.x += Math.cos(ang) * rv.speed * 0.8 * dt; rv.y += Math.sin(ang) * rv.speed * 0.8 * dt; }
        if (d < rv.r + p.r + 6 && rv.atkCd <= 0) { this.hurt(rv.dmg); rv.atkCd = 1.1; }
      } else { // boss
        rv.teleCd -= dt; rv.summonCd -= dt;
        // move toward player
        if (d > 70) { rv.x += dx / d * rv.speed * dt; rv.y += dy / d * rv.speed * dt; }
        rv.x += rv.kx * dt; rv.y += rv.ky * dt; rv.kx *= 0.85; rv.ky *= 0.85;
        if (d < rv.r + p.r + 4 && rv.atkCd <= 0) { this.hurt(rv.dmg); rv.atkCd = 1.0; }
        // teleport behind/near player
        if (rv.teleCd <= 0) {
          const a = rand(0, TAU); rv.x = clamp(p.x + Math.cos(a) * 160, r.x + rv.r, r.x + r.w - rv.r); rv.y = clamp(p.y + Math.sin(a) * 160, r.y + rv.r, r.y + r.h - rv.r);
          rv.teleCd = rand(3.5, 5.5);
          for (let k = 0; k < 12; k++) this.particles.push({ x: rv.x, y: rv.y, vx: rand(-120, 120), vy: rand(-120, 120), life: 0.3, max: 0.3, r: 3, c: '#c8a4ff', kind: 'spark' });
          // fire a radial volley after teleport
          const n = 8; for (let k = 0; k < n; k++) this.ebullets.push({ x: rv.x, y: rv.y, vx: Math.cos(k / n * TAU) * 200, vy: Math.sin(k / n * TAU) * 200, r: 7, dmg: 12, life: 3 });
          Sound.boss && Sound.boss();
        }
        // summon adds
        if (rv.summonCd <= 0 && this.enemies.length < 6) { for (let k = 0; k < 2; k++) this.spawnEnemy('charger'); rv.summonCd = rand(6, 9); this.banner('宿敌召唤了帮手'); }
        // aimed shot
        if (rv.atkCd > 0.4 && Math.random() < dt * 1.5) this.ebullets.push({ x: rv.x, y: rv.y, vx: dx / d * 260, vy: dy / d * 260, r: 7, dmg: 12, life: 3 });
      }
      rv.x = clamp(rv.x, r.x + rv.r, r.x + r.w - rv.r); rv.y = clamp(rv.y, r.y + rv.r, r.y + r.h - rv.r);
    },

    // ---------------- bullets ----------------
    updatePBullets(dt) {
      for (let i = this.pbullets.length - 1; i >= 0; i--) {
        const b = this.pbullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        let dead = b.life <= 0;
        for (const e of this.enemies) { if (b.hit[e.id]) continue; if (dist2(b.x, b.y, e.x, e.y) < (e.r + b.r) ** 2) { this.hitEnemy(e, b.dmg, Math.atan2(b.vy, b.vx)); b.hit[e.id] = 1; if (--b.pierce <= 0) { dead = true; break; } } }
        if (this.rival && (this.rival.down || 0) <= 0 && !b.hit['rv'] && dist2(b.x, b.y, this.rival.x, this.rival.y) < (this.rival.r + b.r) ** 2) { this.hitRival(b.dmg, Math.atan2(b.vy, b.vx)); b.hit['rv'] = 1; if (--b.pierce <= 0) dead = true; }
        if (dead) this.pbullets.splice(i, 1);
      }
    },

    updateEBullets(dt) {
      const p = this.player;
      for (let i = this.ebullets.length - 1; i >= 0; i--) {
        const b = this.ebullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (dist2(b.x, b.y, p.x, p.y) < (p.r + b.r) ** 2) { if (p.iframe <= 0 && p.invulnSpawn <= 0) this.hurt(b.dmg); this.ebullets.splice(i, 1); continue; }
        const r = this.room;
        if (b.life <= 0 || b.x < r.x || b.x > r.x + r.w || b.y < r.y || b.y > r.y + r.h) this.ebullets.splice(i, 1);
      }
    },

    updateSlashes(dt) { for (let i = this.slashes.length - 1; i >= 0; i--) { this.slashes[i].life -= dt; if (this.slashes[i].life <= 0) this.slashes.splice(i, 1); } },
    updateParticles(dt) { for (let i = this.particles.length - 1; i >= 0; i--) { const q = this.particles[i]; q.life -= dt; if (q.kind === 'spark') { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy *= 0.9; } if (q.life <= 0) this.particles.splice(i, 1); } },
    updateTexts(dt) { for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.y -= 40 * dt; t.life -= dt; if (t.life <= 0) this.texts.splice(i, 1); } },

    dmgText(x, y, v) { if (this.texts.length < 40) this.texts.push({ x: x + rand(-5, 5), y, v, life: 0.55 }); },

    nearestEnemy(x, y) {
      let best = null, bd = 1e9;
      for (const e of this.enemies) { const d = dist2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
      if (this.rival && this.rival.mode === 'boss' && (this.rival.down || 0) <= 0) { const d = dist2(x, y, this.rival.x, this.rival.y); if (d < bd) best = this.rival; }
      return best;
    },

    // ---------------- damage / death ----------------
    hurt(amount, ignoreShield) {
      const p = this.player;
      if (p.iframe > 0 || p.invulnSpawn > 0) return;
      if (!ignoreShield && p.shield > 0) { p.shield--; p.shieldTimer = 4; p.iframe = 0.4; Sound.hit && Sound.hit(); return; }
      p.hp -= amount; p.hitFlash = 0.2; p.iframe = Math.max(p.iframe, 0.25);
      Sound.hurt && Sound.hurt();
      if (p.hp <= 0) { p.hp = 0; this.onDeath(); }
    },

    onDeath() {
      if (this.state !== 'playing') return;
      const summit = this.roomDef.type === 'summit';
      if (!summit) {
        // mid-game: knocked down, respawn at entrance, NOT dead
        this.player.hp = Math.max(20, this.player.maxHp * 0.4);
        this.player.x = this.entranceX; this.player.y = this.entranceY;
        this.player.invulnSpawn = 1.6;
        this.banner('被击倒！原地复活（未死）');
        this.particles.push({ x: this.entranceX, y: this.entranceY, vx: 0, vy: 0, life: 0.5, max: 0.5, r: 40, c: '#6fcf97', kind: 'fade' });
        return;
      }
      // summit: real death
      this.state = 'over';
      if (this.roomIdx > Meta.data.bestRoom) Meta.data.bestRoom = this.roomIdx;
      Meta.save();
      Sound.gameover && Sound.gameover();
      this.showOver(false);
    },

    openExit() {
      this.cleared = true; this.exitOpen = true;
      Sound.levelup && Sound.levelup();
      this.banner('出口开启 — 站上传送门上一层');
      this.particles.push({ x: this.exitX, y: this.exitY, vx: 0, vy: 0, life: 0.6, max: 0.6, r: 30, c: '#f4c95d', kind: 'fade' });
    },

    advance() {
      // last gameplay room before summit -> show blessing then summit; between rooms -> blessing
      const next = this.roomIdx + 1;
      if (this.roomIdx > Meta.data.bestRoom) { Meta.data.bestRoom = this.roomIdx; Meta.save(); }
      if (next >= ROOMS.length) { this.winRun(); return; }
      this.state = 'bless';
      this.offerBlessing(next);
    },

    winRun() {
      if (this.state === 'over') return;
      this.state = 'over';
      Meta.data.wins++; Meta.data.bestRoom = ROOMS.length - 1; Meta.save();
      Sound.evolve && Sound.evolve();
      this.showOver(true);
    },

    // ---------------- blessings ----------------
    offerBlessing(nextRoom) {
      this._nextRoom = nextRoom;
      const pool = [];
      for (const id in BLESSINGS) { const cur = this.blessings[id] || 0; if (cur < BLESSINGS[id].max) pool.push(id); }
      const pick = [];
      while (pick.length < 3 && pool.length) pick.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
      const cont = document.getElementById('bless-cards'); cont.innerHTML = '';
      document.getElementById('bless').classList.remove('hidden');
      pick.forEach(id => {
        const b = BLESSINGS[id]; const cur = this.blessings[id] || 0;
        const card = document.createElement('div'); card.className = 'bl-card';
        card.innerHTML = `<div class="ic">${b.ic}</div><div class="nm">${b.nm}</div>` +
          `<div class="lv">${cur ? '等级 ' + cur + ' → ' + (cur + 1) : '新祝福'}</div><div class="ds">${b.ds}</div>`;
        card.onclick = () => this.takeBlessing(id);
        cont.appendChild(card);
      });
      if (pick.length === 0) this.takeBlessing(null); // pool empty fallback
    },

    takeBlessing(id) {
      if (id) { this.blessings[id] = (this.blessings[id] || 0) + 1; BLESSINGS[id].apply(this.player); }
      Sound.select && Sound.select();
      document.getElementById('bless').classList.add('hidden');
      this.state = 'playing';
      this.enterRoom(this._nextRoom);
    },

    // ---------------- pause / over ----------------
    togglePause() {
      if (this.state === 'playing') { this.state = 'pause'; document.getElementById('pause').classList.remove('hidden'); this.renderBuild(); Sound.stopMusic && Sound.stopMusic(); }
      else if (this.state === 'pause') { this.state = 'playing'; document.getElementById('pause').classList.add('hidden'); Sound.startMusic && Sound.startMusic(0); }
    },

    renderBuild() {
      let h = '<div>';
      const ks = Object.keys(this.blessings);
      h += ks.length ? ks.map(id => `<span class="chip">${BLESSINGS[id].ic} ${BLESSINGS[id].nm} L${this.blessings[id]}</span>`).join('') : '还没有祝福';
      h += '</div>';
      document.getElementById('pause-build').innerHTML = h;
    },

    showOver(won) {
      this.hideAll();
      document.getElementById('over').classList.remove('hidden');
      document.getElementById('over-title').textContent = won ? '🏔 登顶成功！' : '登顶失败';
      const ks = Object.keys(this.blessings);
      document.getElementById('over-stats').innerHTML =
        (won ? '你击败了宿敌，登上了绝巅。' : `倒在了 ${this.stage.nm} · 第 ${this.roomIdx + 1} 间`) +
        '<br><br>' + (ks.length ? ks.map(id => `<span class="chip">${BLESSINGS[id].ic} ${BLESSINGS[id].nm} L${this.blessings[id]}</span>`).join('') : '');
    },

    banner(t) { this._banner = { t, life: 2 }; },

    // ---------------- HUD ----------------
    updateHUD() {
      const p = this.player;
      document.getElementById('hp-fill').style.width = clamp(p.hp / p.maxHp * 100, 0, 100) + '%';
      document.getElementById('hp-text').textContent = Math.ceil(p.hp) + ' / ' + p.maxHp + (p.shield ? '  🛡️×' + p.shield : '');
      document.getElementById('stage-label').textContent = this.stage.nm;
      const tm = document.getElementById('room-timer');
      if (this.roomDef.type === 'summit') tm.textContent = '⚔ 决斗';
      else tm.textContent = this.cleared ? '✓ 已清' : fmtT(this.roomTime);
      document.getElementById('dash-pips').textContent = '💨'.repeat(p.dashCharges) + '·'.repeat(Math.max(0, p.dashMax - p.dashCharges));
      if (this.rival) {
        const f = document.getElementById('rival-fill');
        if (this.rival.boss) f.style.width = clamp(this.rival.hp / this.rival.maxHp * 100, 0, 100) + '%';
        else f.style.width = clamp((this.rival.down > 0 ? 0 : this.rival.kdHp / this.rival.kdMax) * 100, 0, 100) + '%';
      }
    },

    // ---------------- render ----------------
    render() {
      const ctx = this.ctx;
      ctx.fillStyle = '#0a0710'; ctx.fillRect(0, 0, this.W, this.H);
      if (this.state === 'menu' || this.state === 'howto') { this.renderMenuBg(ctx); return; }
      if (!this.player) return;
      const r = this.room, st = this.stage;

      // floor
      ctx.fillStyle = st.floor; ctx.fillRect(r.x, r.y, r.w, r.h);
      // floor grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = r.x; x <= r.x + r.w; x += 56) { ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); }
      for (let y = r.y; y <= r.y + r.h; y += 56) { ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); }
      ctx.stroke();
      // walls
      ctx.strokeStyle = st.wall; ctx.lineWidth = 6; ctx.strokeRect(r.x, r.y, r.w, r.h);

      // exit portal
      if (this.exitOpen) {
        const t = Date.now() / 300;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(this.exitX, this.exitY, 0, this.exitX, this.exitY, 34 + Math.sin(t) * 4);
        g.addColorStop(0, 'rgba(244,201,93,0.9)'); g.addColorStop(1, 'rgba(244,201,93,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.exitX, this.exitY, 34 + Math.sin(t) * 4, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#f4c95d'; ctx.font = 'bold 20px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('▲', this.exitX, this.exitY + 6);
      }

      // storm (summit) — darken outside safe circle
      if (this.storm) {
        ctx.save();
        ctx.fillStyle = 'rgba(120,20,40,0.30)';
        ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h);
        ctx.arc(this.storm.cx, this.storm.cy, this.storm.r, 0, TAU, true); ctx.fill('evenodd');
        ctx.strokeStyle = 'rgba(255,80,110,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.storm.cx, this.storm.cy, this.storm.r, 0, TAU); ctx.stroke();
        ctx.restore();
      }

      // particles (under)
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const q of this.particles) {
        const a = clamp(q.life / q.max, 0, 1);
        if (q.bolt) { ctx.strokeStyle = q.c; ctx.globalAlpha = a; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q.bolt[0], q.bolt[1]); ctx.lineTo(q.bolt[2], q.bolt[3]); ctx.stroke(); }
        else { ctx.globalAlpha = a; ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (q.kind === 'fade' ? (1 + (1 - a) * 1.5) : 1), 0, TAU); ctx.fill(); }
      }
      ctx.globalAlpha = 1; ctx.restore();

      // enemies
      for (const e of this.enemies) this.drawEnemy(ctx, e);
      // rival
      if (this.rival) this.drawRival(ctx);

      // enemy bullets
      for (const b of this.ebullets) { ctx.fillStyle = '#ff5c7a'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,200,210,.7)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * .5, 0, TAU); ctx.fill(); }
      // player bullets
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const b of this.pbullets) { ctx.fillStyle = '#9af6ff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); }
      ctx.restore();

      // slashes
      for (const s of this.slashes) {
        const a = clamp(s.life / s.max, 0, 1);
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ang);
        ctx.strokeStyle = `rgba(255,245,210,${a})`; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, s.reach, -s.arc, s.arc); ctx.stroke();
        ctx.restore();
      }

      // player
      this.drawPlayer(ctx);

      // damage texts
      ctx.textAlign = 'center';
      for (const t of this.texts) { ctx.globalAlpha = clamp(t.life / 0.55, 0, 1); ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui'; ctx.fillText(t.v, t.x, t.y); }
      ctx.globalAlpha = 1;

      // touch joystick
      if (Input.touchMove) { ctx.save(); ctx.globalAlpha = .4; ctx.strokeStyle = '#9b7bd4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(Input.joyBaseX, Input.joyBaseY, 64, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(155,123,212,.6)'; ctx.beginPath(); ctx.arc(Input.joyX, Input.joyY, 26, 0, TAU); ctx.fill(); ctx.restore(); }

      // banner
      if (this._banner) { this._banner.life -= 0.016; if (this._banner.life <= 0) this._banner = null; else { ctx.save(); ctx.globalAlpha = clamp(this._banner.life, 0, 1); ctx.fillStyle = '#f4c95d'; ctx.font = '900 26px system-ui'; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 8; ctx.fillText(this._banner.t, this.W / 2, r.y + 70); ctx.restore(); } }
    },

    drawEnemy(ctx, e) {
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.fillStyle = e.flash > 0 ? '#fff' : e.color; ctx.strokeStyle = e.color; ctx.lineWidth = 2;
      ctx.beginPath();
      if (e.shape === 'tri') { for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * e.r, Math.sin(a) * e.r); } ctx.closePath(); }
      else if (e.shape === 'diamond') { ctx.moveTo(0, -e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r); ctx.lineTo(-e.r, 0); ctx.closePath(); }
      else if (e.shape === 'hex') { for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * e.r, Math.sin(a) * e.r); } ctx.closePath(); }
      else ctx.arc(0, 0, e.r, 0, TAU);
      ctx.globalAlpha = .9; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      ctx.restore();
      // hp bar for brute
      if (e.maxHp > 50) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(e.x - 20, e.y - e.r - 10, 40, 4); ctx.fillStyle = e.color; ctx.fillRect(e.x - 20, e.y - e.r - 10, 40 * clamp(e.hp / e.maxHp, 0, 1), 4); }
    },

    drawRival(ctx) {
      const rv = this.rival;
      ctx.save(); ctx.translate(rv.x, rv.y);
      if (rv.down > 0) ctx.globalAlpha = 0.3;
      // glow
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rv.r + 12); g.addColorStop(0, 'rgba(155,123,212,.5)'); g.addColorStop(1, 'rgba(155,123,212,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rv.r + 12, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rv.flash > 0 ? '#fff' : '#c8a4ff'; ctx.strokeStyle = '#e8dcff'; ctx.lineWidth = 3;
      // star shape
      ctx.beginPath(); const sp = rv.boss ? 6 : 5; for (let i = 0; i < sp * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / sp; const rr = i % 2 ? rv.r * .5 : rv.r; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    },

    drawPlayer(ctx) {
      const p = this.player;
      ctx.save(); ctx.translate(p.x, p.y);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, p.r * .7, p.r * .8, p.r * .35, 0, 0, TAU); ctx.fill();
      const inv = (p.iframe > 0 || p.invulnSpawn > 0) && Math.floor(Date.now() / 60) % 2 === 0;
      ctx.globalAlpha = inv ? 0.45 : 1;
      // glow
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30); g.addColorStop(0, 'rgba(244,201,93,.45)'); g.addColorStop(1, 'rgba(244,201,93,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.rotate(p.facing + Math.PI / 2);
      ctx.fillStyle = p.hitFlash > 0 ? '#ff4d6d' : '#f6ecd6'; ctx.strokeStyle = '#f4c95d'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, -p.r - 3); ctx.lineTo(p.r, p.r); ctx.lineTo(0, p.r * .4); ctx.lineTo(-p.r, p.r); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    },

    _bgT: 0,
    renderMenuBg(ctx) {
      this._bgT += 0.004;
      for (let i = 0; i < 50; i++) {
        const x = (Math.sin(i * 9.7 + this._bgT) * .5 + .5) * this.W;
        const y = ((i * 47.3 + this._bgT * 40) % this.H);
        ctx.fillStyle = i % 3 ? 'rgba(244,201,93,.35)' : 'rgba(155,123,212,.3)';
        ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3), 0, TAU); ctx.fill();
      }
    },

    // ---------------- test helpers ----------------
    _testClearRoom() { this.enemies = []; if (this.rival && this.rival.mode === 'harass') this.rival.down = 99; },
  };

  window.Game = Game;
  window.addEventListener('DOMContentLoaded', () => Game.init());
})();
