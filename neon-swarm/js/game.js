// NEON SWARM — core game engine.
(function () {
  'use strict';

  // ---------------------------------------------------------------- helpers
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const fmtTime = (s) => {
    s = Math.floor(s);
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  };

  // ---------------------------------------------------------------- daily seed
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function todaySeed() {
    const d = new Date();
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }
  function todayLabel() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  // Daily modifiers — two are rolled each day to keep the challenge fresh.
  const DAILY_MODIFIERS = [
    { id: 'doublexp', ic: '📘', nm: 'Double XP', ds: 'Gain XP twice as fast.', apply: (g, p) => { p.xpMul *= 2; } },
    { id: 'glass', ic: '💥', nm: 'Glass Cannon', ds: '+50% damage dealt and taken.', apply: (g, p) => { p.dmgMul += 0.5; g.modIncomingDmg = 1.5; } },
    { id: 'swarm', ic: '🐝', nm: 'Swarm', ds: 'Far more enemies spawn.', apply: (g) => { g.modSpawnMul = 1.4; } },
    { id: 'bossrush', ic: '👹', nm: 'Boss Rush', ds: 'A boss every 60 seconds.', apply: (g) => { g.modBossPeriod = 60; } },
    { id: 'goldrush', ic: '◈', nm: 'Gold Rush', ds: 'Double coins.', apply: (g, p) => { p.coinMul += 1; } },
    { id: 'frenzy', ic: '🌀', nm: 'Frenzy', ds: 'Everything moves faster.', apply: (g, p) => { g.modEnemySpeed = 1.25; p.speedMul += 0.12; } },
    { id: 'berserk', ic: '🔥', nm: 'Berserk', ds: '+30% fire rate, but 30% less HP.', apply: (g, p) => { p.fireRateMul *= 0.77; p.maxHp = Math.round(p.maxHp * 0.7); } },
    { id: 'magnetize', ic: '🧲', nm: 'Magnetize', ds: 'Huge pickup range.', apply: (g, p) => { p.pickupMul += 1; } },
  ];

  function buildDailyConfig() {
    const seed = todaySeed();
    const r = mulberry32(seed);
    const pilot = CHARACTERS[Math.floor(r() * CHARACTERS.length)].id;
    const diff = ['normal', 'hard'][Math.floor(r() * 2)];
    const pool = DAILY_MODIFIERS.slice();
    const mods = [];
    for (let i = 0; i < 2; i++) mods.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return { seed, pilot, diff, mods };
  }

  // ---------------------------------------------------------------- meta save
  const SAVE_KEY = 'neonswarm_save_v1';
  const Meta = {
    data: { coins: 0, best: 0, bestTime: 0, runs: 0, totalKills: 0, bossKills: 0, coinsEarned: 0, upgrades: {}, chars: { vanguard: 1 }, achievements: {}, muted: 0, lastChar: 'vanguard', scores: [], difficulty: 'normal',
      settings: { music: 100, sfx: 100, shake: 1, dmg: 1, lowq: 0 }, daily: { seed: 0, best: 0, plays: 0 } },
    load() {
      try {
        const s = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (s) this.data = Object.assign(this.data, s);
        if (!this.data.upgrades) this.data.upgrades = {};
        if (!this.data.chars) this.data.chars = { vanguard: 1 };
        if (!this.data.achievements) this.data.achievements = {};
        if (!this.data.settings) this.data.settings = { music: 100, sfx: 100, shake: 1, dmg: 1, lowq: 0 };
      } catch (e) {}
    },
    save() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) {}
    },
    lvl(id) { return this.data.upgrades[id] || 0; },
    hasChar(id) { return !!this.data.chars[id]; },
  };

  // ---------------------------------------------------------------- difficulty
  const DIFFICULTIES = [
    { id: 'easy', nm: 'EASY', dmg: 0.7, spawn: 0.85, hp: 0.85, score: 0.7 },
    { id: 'normal', nm: 'NORMAL', dmg: 1.0, spawn: 1.0, hp: 1.0, score: 1.0 },
    { id: 'hard', nm: 'HARD', dmg: 1.45, spawn: 1.18, hp: 1.12, score: 1.5 },
  ];
  const diffById = (id) => DIFFICULTIES.find(d => d.id === id) || DIFFICULTIES[1];

  // ---------------------------------------------------------------- achievements
  const ACHIEVEMENTS = [
    { id: 'first100', ic: '☠️', nm: 'First Blood', ds: 'Kill 100 enemies (lifetime)', reward: 25, check: s => s.totalKills >= 100 },
    { id: 'evolve1', ic: '⚡', nm: 'Transcend', ds: 'Evolve a weapon', reward: 50, check: s => s.evolved >= 1 },
    { id: 'combo50', ic: '🔥', nm: 'Combo Master', ds: 'Reach a 50x combo', reward: 50, check: s => s.combo >= 50 },
    { id: 'survive3', ic: '⏱️', nm: 'Survivor', ds: 'Survive 3 minutes', reward: 50, check: s => s.time >= 180 },
    { id: 'kills500', ic: '💀', nm: 'Slayer', ds: '500 kills in one run', reward: 50, check: s => s.kills >= 500 },
    { id: 'level30', ic: '📈', nm: 'Ascendant', ds: 'Reach level 30 in a run', reward: 75, check: s => s.level >= 30 },
    { id: 'boss5', ic: '👹', nm: 'Boss Hunter', ds: 'Defeat 5 bosses (lifetime)', reward: 75, check: s => s.bossKills >= 5 },
    { id: 'survive5', ic: '🏅', nm: 'Veteran', ds: 'Survive 5 minutes', reward: 100, check: s => s.time >= 300 },
    { id: 'kills2000', ic: '☢️', nm: 'Exterminator', ds: '2000 kills in one run', reward: 100, check: s => s.kills >= 2000 },
    { id: 'allpilots', ic: '🛸', nm: 'Full Roster', ds: 'Unlock every pilot', reward: 100, check: s => s.allPilots },
  ];

  // ---------------------------------------------------------------- characters
  const CHARACTERS = [
    {
      id: 'vanguard', nm: 'Vanguard', ic: '🛸', color: '#18e0ff',
      ds: 'Balanced all-rounder. No weaknesses.', weapon: 'pulse',
      mods: {}, unlock: { type: 'free' },
    },
    {
      id: 'striker', nm: 'Striker', ic: '🔺', color: '#ff4d6d',
      ds: '+25% damage, +6% crit, but 25% less HP. Glass cannon.', weapon: 'shotgun',
      mods: { dmgMul: 0.25, crit: 0.06, hpMul: -0.25 }, unlock: { type: 'coins', amt: 200 },
    },
    {
      id: 'warden', nm: 'Warden', ic: '🛡️', color: '#9b5cff',
      ds: '+45% HP, +0.5 regen, but 12% slower. Bruiser.', weapon: 'orbit',
      mods: { hpMul: 0.45, regen: 0.5, speedMul: -0.12 }, unlock: { type: 'coins', amt: 250 },
    },
    {
      id: 'sprinter', nm: 'Sprinter', ic: '⚡', color: '#ffd84d',
      ds: '+22% speed, +40% pickup, faster fire. Hit-and-run.', weapon: 'boomerang',
      mods: { speedMul: 0.22, pickupMul: 0.40, fireRateMul: 0.88 }, unlock: { type: 'level', amt: 15 },
    },
    {
      id: 'tempest', nm: 'Tempest', ic: '🌩️', color: '#fff06b',
      ds: '+15% area, +12% XP, starts with the Tesla Coil.', weapon: 'chain',
      mods: { areaMul: 0.15, xpMul: 0.12 }, unlock: { type: 'time', amt: 300 },
    },
  ];
  const charById = (id) => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];

  // Meta upgrade definitions (permanent, bought with coins)
  const META_UPGRADES = [
    { id: 'might', ic: '💢', nm: 'Might', ds: '+6% damage', max: 5, cost: (l) => 40 + l * 35, val: 0.06 },
    { id: 'armor', ic: '🛡️', nm: 'Armor', ds: '+8 max HP', max: 5, cost: (l) => 35 + l * 30, val: 8 },
    { id: 'swift', ic: '👟', nm: 'Swift', ds: '+4% move speed', max: 5, cost: (l) => 35 + l * 30, val: 0.04 },
    { id: 'haste', ic: '⚡', nm: 'Haste', ds: '+4% fire rate', max: 5, cost: (l) => 45 + l * 40, val: 0.04 },
    { id: 'greed', ic: '◈', nm: 'Greed', ds: '+10% coins', max: 5, cost: (l) => 30 + l * 25, val: 0.10 },
    { id: 'wisdom', ic: '📘', nm: 'Wisdom', ds: '+6% XP gain', max: 5, cost: (l) => 40 + l * 35, val: 0.06 },
    { id: 'magnet', ic: '🧲', nm: 'Magnet', ds: '+12% pickup range', max: 5, cost: (l) => 30 + l * 25, val: 0.12 },
    { id: 'vitality', ic: '❤️', nm: 'Regen', ds: '+0.2 HP/s regen', max: 5, cost: (l) => 50 + l * 45, val: 0.2 },
    { id: 'revive', ic: '✨', nm: 'Revive', ds: 'Start with +1 revive', max: 1, cost: () => 300, val: 1 },
    { id: 'luck', ic: '🍀', nm: 'Luck', ds: '+1 reroll per run', max: 3, cost: (l) => 60 + l * 60, val: 1 },
  ];

  // ---------------------------------------------------------------- weapons
  // Each weapon: id, name, icon, color, maxLevel, desc(level), and behavior hooks.
  const WEAPONS = {
    pulse: {
      id: 'pulse', nm: 'Pulse Blaster', ic: '🔫', color: '#18e0ff', max: 8,
      desc: (l) => l === 0 ? 'Auto-fires a bolt at the nearest foe.' :
        l >= 8 ? 'MAX' : '+damage, +bolts, faster fire.',
      base: { cd: 0.5, dmg: 14, speed: 560, count: 1, pierce: 0 },
      stat(l) {
        return {
          cd: this.base.cd * (1 - Math.min(0.45, l * 0.06)),
          dmg: this.base.dmg + l * 5,
          speed: this.base.speed,
          count: this.base.count + Math.floor(l / 2),
          pierce: Math.floor(l / 4),
        };
      },
      fire(g, p) {
        const s = this.stat(g.weaponLevel('pulse'));
        const evo = g.isEvolved('pulse');
        const dmg = (s.dmg * (evo ? 2 : 1)) * g.dmgMul;
        const pierce = s.pierce + (evo ? 3 : 0);
        const col = evo ? EVOLUTIONS.pulse.color : this.color;
        const n = s.count + (evo ? 2 : 0);
        const targets = g.nearestEnemies(p.x, p.y, n);
        for (let i = 0; i < n; i++) {
          let ang;
          if (targets[i]) ang = Math.atan2(targets[i].y - p.y, targets[i].x - p.x);
          else if (targets[0]) ang = Math.atan2(targets[0].y - p.y, targets[0].x - p.x) + rand(-0.4, 0.4);
          else ang = rand(0, TAU);
          g.spawnBullet(p.x, p.y, ang, s.speed, dmg, pierce, col, evo ? 6 : 5);
        }
        if (evo) { // extra omnidirectional ring
          const ring = 8;
          for (let k = 0; k < ring; k++) g.spawnBullet(p.x, p.y, (k / ring) * TAU, s.speed * 0.9, dmg * 0.7, pierce, col, 5);
        }
        Sound.shoot();
      },
    },

    orbit: {
      id: 'orbit', nm: 'Orbit Blades', ic: '🌀', color: '#4dff9e', max: 8,
      desc: (l) => l === 0 ? 'Blades spin around you, slicing foes.' : l >= 8 ? 'MAX' : '+blades, +damage, +size.',
      stat(l) { return { count: 2 + Math.floor((l + 1) / 2), dmg: 10 + l * 4, radius: 78 + l * 6, speed: 2.6 }; },
      // handled continuously in game.updateOrbiters
    },

    nova: {
      id: 'nova', nm: 'Shock Nova', ic: '💥', color: '#ff2bd6', max: 8,
      desc: (l) => l === 0 ? 'Releases an expanding shockwave.' : l >= 8 ? 'MAX' : '+damage, +area, faster.',
      stat(l) { return { cd: 1.8 * (1 - Math.min(0.45, l * 0.06)), dmg: 22 + l * 9, radius: 165 + l * 26 }; },
      fire(g, p) {
        const s = this.stat(g.weaponLevel('nova'));
        const evo = g.isEvolved('nova');
        g.spawnZone(p.x, p.y, s.radius * g.areaMul * (evo ? 1.4 : 1), s.dmg * g.dmgMul * (evo ? 2 : 1), evo ? EVOLUTIONS.nova.color : this.color, evo);
        Sound.shootBig();
      },
    },

    chain: {
      id: 'chain', nm: 'Tesla Coil', ic: '🌩️', color: '#ffd84d', max: 8,
      desc: (l) => l === 0 ? 'Zaps a foe and chains to nearby ones.' : l >= 8 ? 'MAX' : '+damage, +jumps.',
      stat(l) { return { cd: 1.1 * (1 - Math.min(0.4, l * 0.05)), dmg: 14 + l * 6, jumps: 2 + Math.floor(l / 1.5) }; },
      fire(g, p) {
        const s = this.stat(g.weaponLevel('chain'));
        const evo = g.isEvolved('chain');
        if (evo) {
          g.castChain(p.x, p.y, s.dmg * g.dmgMul * 1.6, s.jumps * 2, EVOLUTIONS.chain.color);
          g.castChain(p.x, p.y, s.dmg * g.dmgMul * 1.6, s.jumps * 2, EVOLUTIONS.chain.color);
        } else {
          g.castChain(p.x, p.y, s.dmg * g.dmgMul, s.jumps, this.color);
        }
      },
    },

    shotgun: {
      id: 'shotgun', nm: 'Scatter Gun', ic: '🎇', color: '#ff8a5c', max: 8,
      desc: (l) => l === 0 ? 'Fires a spread of pellets forward.' : l >= 8 ? 'MAX' : '+pellets, +damage.',
      stat(l) { return { cd: 0.9 * (1 - Math.min(0.4, l * 0.05)), dmg: 9 + l * 4, pellets: 4 + l, spread: 0.9 }; },
      fire(g, p) {
        const s = this.stat(g.weaponLevel('shotgun'));
        const evo = g.isEvolved('shotgun');
        const pellets = Math.round(s.pellets * (evo ? 1.7 : 1));
        const dmg = s.dmg * g.dmgMul * (evo ? 1.6 : 1);
        const col = evo ? EVOLUTIONS.shotgun.color : this.color;
        const spread = evo ? s.spread * 1.4 : s.spread;
        const t = g.nearestEnemies(p.x, p.y, 1)[0];
        const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : rand(0, TAU);
        for (let i = 0; i < pellets; i++) {
          const ang = base + rand(-spread / 2, spread / 2);
          g.spawnBullet(p.x, p.y, ang, rand(420, 560), dmg, evo ? 1 : 0, col, evo ? 5 : 4, 0.5);
        }
        Sound.shootBig();
      },
    },

    boomerang: {
      id: 'boomerang', nm: 'Boomerang', ic: '🪃', color: '#9af6ff', max: 8,
      desc: (l) => l === 0 ? 'Throws a piercing disc that returns.' : l >= 8 ? 'MAX' : '+count, +damage, +range.',
      stat(l) { return { cd: 1.4 * (1 - Math.min(0.4, l * 0.05)), dmg: 11 + l * 5, count: 1 + Math.floor(l / 3), range: 260 + l * 20 }; },
      fire(g, p) {
        const s = this.stat(g.weaponLevel('boomerang'));
        const evo = g.isEvolved('boomerang');
        const count = s.count + (evo ? 3 : 0);
        const dmg = s.dmg * g.dmgMul * (evo ? 1.6 : 1);
        const col = evo ? EVOLUTIONS.boomerang.color : this.color;
        if (evo) {
          // orbiting ring of discs
          for (let i = 0; i < count; i++) g.spawnBoomerang(p.x, p.y, (i / count) * TAU, dmg, s.range * g.areaMul * 1.3, col, true);
        } else {
          const t = g.nearestEnemies(p.x, p.y, 1)[0];
          const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : rand(0, TAU);
          for (let i = 0; i < count; i++) {
            const ang = base + (i - (count - 1) / 2) * 0.4;
            g.spawnBoomerang(p.x, p.y, ang, dmg, s.range * g.areaMul, col);
          }
        }
        Sound.shoot();
      },
    },
  };

  // ---------------------------------------------------------------- evolutions
  // Max(ish) a weapon + pair passive -> unlock a transformed super-weapon.
  const EVOLUTIONS = {
    pulse: { nm: 'Pulse Storm', ic: '🌟', color: '#9af6ff', pass: 'haste', ds: 'A storm of piercing bolts in every direction.' },
    orbit: { nm: 'Saw Halo', ic: '☄️', color: '#4dffd0', pass: 'area', ds: 'A roaring halo of giant blades.' },
    nova: { nm: 'Singularity', ic: '🕳️', color: '#c46bff', pass: 'might', ds: 'Implodes foes inward, then detonates.' },
    chain: { nm: 'Storm Caller', ic: '⛈️', color: '#fff06b', pass: 'crit', ds: 'Relentless forking lightning.' },
    shotgun: { nm: 'Flak Cannon', ic: '💢', color: '#ff9a3c', pass: 'magnet', ds: 'A devastating point-blank wall of shot.' },
    boomerang: { nm: 'Cyclone', ic: '🌪️', color: '#9af6ff', pass: 'swift', ds: 'Discs that orbit and never return.' },
  };
  const EVO_WEAPON_REQ = 5;   // base weapon level required
  const EVO_PASSIVE_REQ = 2;  // paired passive level required

  // ---------------------------------------------------------------- passives
  const PASSIVES = {
    might: { id: 'might', nm: 'Power Core', ic: '💢', color: '#ff4d6d', max: 5, ds: '+12% damage', apply(p) { p.dmgMul += 0.12; } },
    haste: { id: 'haste', nm: 'Overclock', ic: '⚡', color: '#ffd84d', max: 5, ds: '+10% fire rate', apply(p) { p.fireRateMul *= 0.91; } },
    swift: { id: 'swift', nm: 'Jet Boots', ic: '👟', color: '#18e0ff', max: 5, ds: '+10% move speed', apply(p) { p.speedMul += 0.10; } },
    area: { id: 'area', nm: 'Resonator', ic: '🔆', color: '#ff2bd6', max: 5, ds: '+12% area', apply(p) { p.areaMul += 0.12; } },
    vigor: { id: 'vigor', nm: 'Vital Plate', ic: '❤️', color: '#4dff9e', max: 5, ds: '+20 max HP & heal', apply(p) { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } },
    magnet: { id: 'magnet', nm: 'Magnet Field', ic: '🧲', color: '#9af6ff', max: 5, ds: '+25% pickup range', apply(p) { p.pickupMul += 0.25; } },
    regen: { id: 'regen', nm: 'Nanobots', ic: '✚', color: '#4dff9e', max: 5, ds: '+0.5 HP/s regen', apply(p) { p.regen += 0.5; } },
    growth: { id: 'growth', nm: 'Mind Link', ic: '📘', color: '#6f8cff', max: 5, ds: '+12% XP gain', apply(p) { p.xpMul += 0.12; } },
    crit: { id: 'crit', nm: 'Focus Lens', ic: '🎯', color: '#ffd84d', max: 5, ds: '+8% crit chance', apply(p) { p.crit += 0.08; } },
  };

  // ---------------------------------------------------------------- enemies
  const ENEMY_TYPES = {
    grunt: { hp: 14, speed: 84, r: 14, dmg: 7, xp: 1, color: '#ff5c8a', shape: 'tri', coin: 0.10 },
    swift: { hp: 9, speed: 158, r: 11, dmg: 6, xp: 1, color: '#ffe24d', shape: 'diamond', coin: 0.10 },
    tank: { hp: 60, speed: 58, r: 22, dmg: 12, xp: 4, color: '#9b5cff', shape: 'hex', coin: 0.18 },
    bomber: { hp: 22, speed: 96, r: 16, dmg: 18, xp: 2, color: '#ff7a3c', shape: 'square', coin: 0.14, explodes: true },
    splitter: { hp: 34, speed: 72, r: 18, dmg: 10, xp: 2, color: '#5cffb0', shape: 'diamond', coin: 0.14, splits: true },
    brute: { hp: 130, speed: 50, r: 28, dmg: 18, xp: 7, color: '#ff5c3c', shape: 'hex', coin: 0.30 },
    shooter: { hp: 28, speed: 58, r: 15, dmg: 9, xp: 3, color: '#ff4da6', shape: 'star', coin: 0.22, ranged: true },
    boss: { hp: 850, speed: 62, r: 46, dmg: 20, xp: 60, color: '#ff2bd6', shape: 'star', coin: 1.0, boss: true },
  };

  // ---------------------------------------------------------------- entities
  class Player {
    constructor() {
      this.x = 0; this.y = 0;
      this.r = 15;
      this.maxHp = 100;
      this.hp = 100;
      this.baseSpeed = 200;
      this.level = 1;
      this.xp = 0;
      this.xpNext = 5;
      this.facing = 0;
      this.invuln = 0;
      this.hitFlash = 0;
      // multipliers (modified by passives + meta)
      this.dmgMul = 1; this.fireRateMul = 1; this.speedMul = 1;
      this.areaMul = 1; this.pickupMul = 1; this.xpMul = 1;
      this.crit = 0.02; this.regen = 0; this.coinMul = 1;
      this.revives = 0;
    }
    get speed() { return this.baseSpeed * this.speedMul; }
    get pickupR() { return 105 * this.pickupMul; }
  }

  // ---------------------------------------------------------------- the game
  const Game = {
    canvas: null, ctx: null, W: 0, H: 0, DPR: 1,
    state: 'menu', // menu, playing, levelup, pause, gameover, shop, howto
    player: null,
    enemies: [], bullets: [], enemyBullets: [], gems: [], coins: [], particles: [], dmgTexts: [], zones: [], orbiters: [], booms: [], pickups: [],
    cam: { x: 0, y: 0, shake: 0 },
    time: 0, kills: 0, runCoins: 0,
    weapons: {}, // id -> level
    passives: {}, // id -> level
    weaponTimers: {},
    spawnAcc: 0, lastTime: 0,
    rerolls: 0,
    shakeAmt: 0,
    bossSpawned: {},
    paused: false,
    dmgMul: 1, areaMul: 1, // convenience mirrors of player for weapon code
    bgGrid: 110,

    init() {
      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d');
      Meta.load();
      if (window.Ads) Ads.init();
      if (window.Analytics) Analytics.init();
      Input.init(this.canvas);
      this.genStars();
      this.resize();
      window.addEventListener('resize', () => this.resize());
      // auto-pause when the tab is hidden so players don't die while away
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'playing') this.togglePause();
      });
      // desktop keyboard shortcuts
      window.addEventListener('keydown', (e) => this.onKey(e));
      this.wireUI();
      this.showMenu();
      requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.DPR = dpr;
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      this.canvas.width = Math.floor(this.W * dpr);
      this.canvas.height = Math.floor(this.H * dpr);
      this.canvas.style.width = this.W + 'px';
      this.canvas.style.height = this.H + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    // ---- UI wiring ----
    wireUI() {
      const $ = (id) => document.getElementById(id);
      $('play-btn').onclick = () => { Sound.init(); Sound.resume(); this.showCharSelect(); };
      $('daily-btn').onclick = () => { Sound.init(); Sound.resume(); this.showDaily(); };
      $('daily-back').onclick = () => this.showMenu();
      $('daily-play').onclick = () => this.startDaily();
      $('upgrades-btn').onclick = () => this.showShop();
      $('awards-btn').onclick = () => this.showAwards();
      $('awards-back').onclick = () => this.showMenu();
      $('how-btn').onclick = () => { this.hideAll(); $('howto').classList.remove('hidden'); };
      $('howto-back').onclick = () => this.showMenu();
      $('shop-back').onclick = () => this.showMenu();
      $('char-back').onclick = () => this.showMenu();
      $('diff-prev').onclick = () => this.cycleDifficulty(-1);
      $('diff-next').onclick = () => this.cycleDifficulty(1);
      $('pause-btn').onclick = () => this.togglePause();
      $('resume-btn').onclick = () => this.togglePause();
      $('quit-btn').onclick = () => { if (window.Ads) Ads.gameplayStop(); this.endRun(false); this.showMenu(); };
      $('retry-btn').onclick = async () => { if (window.Ads) await Ads.interstitial(); if (this.isDaily) this.startDaily(); else this.startRun(this.charId); };
      $('menu-btn').onclick = async () => { if (window.Ads) await Ads.interstitial(); this.showMenu(); };
      $('continue-btn').onclick = () => this.continueRun();
      $('share-btn').onclick = () => this.shareScore();
      $('settings-btn').onclick = () => this.showSettings();
      $('settings-back').onclick = () => this.showMenu();
      this.applySettings();
      $('lu-reroll').onclick = () => this.reroll();
      const mute = $('mute-btn');
      Sound.setMuted(!!Meta.data.muted);
      mute.textContent = Meta.data.muted ? '🔇' : '🔊';
      mute.onclick = () => {
        Meta.data.muted = Meta.data.muted ? 0 : 1;
        Meta.save();
        Sound.init(); Sound.setMuted(!!Meta.data.muted);
        mute.textContent = Meta.data.muted ? '🔇' : '🔊';
      };
    },

    // ---- character select ----
    showCharSelect() {
      this.state = 'charselect';
      this.hideAll();
      document.getElementById('charselect').classList.remove('hidden');
      this.renderDifficulty();
      this.renderChars();
    },

    renderDifficulty() {
      const d = diffById(Meta.data.difficulty);
      document.getElementById('diff-name').textContent = d.nm;
      document.getElementById('diff-mult').textContent = d.score.toFixed(1) + '× score';
    },

    cycleDifficulty(dir) {
      const idx = DIFFICULTIES.findIndex(d => d.id === Meta.data.difficulty);
      const ni = (idx + dir + DIFFICULTIES.length) % DIFFICULTIES.length;
      Meta.data.difficulty = DIFFICULTIES[ni].id;
      Meta.save();
      Sound.select();
      this.renderDifficulty();
    },

    renderChars() {
      const grid = document.getElementById('char-grid');
      grid.innerHTML = '';
      CHARACTERS.forEach(c => {
        const unlocked = c.unlock.type === 'free' || Meta.hasChar(c.id);
        const card = document.createElement('div');
        card.className = 'char-card' + (unlocked ? '' : ' locked');
        const w = WEAPONS[c.weapon];
        let lockLine = '';
        if (!unlocked) {
          if (c.unlock.type === 'coins') lockLine = `<div class="lock">🔒 Unlock: ◈ ${c.unlock.amt}</div>`;
          else if (c.unlock.type === 'level') lockLine = `<div class="lock">🔒 Reach Level ${c.unlock.amt}</div>`;
          else if (c.unlock.type === 'time') lockLine = `<div class="lock">🔒 Survive ${Math.floor(c.unlock.amt / 60)} min</div>`;
        }
        card.innerHTML = `<div class="ic" style="color:${c.color}">${c.ic}</div>
          <div class="nm">${c.nm}</div><div class="ds">${c.ds}</div>
          <div class="wp">${w.ic} ${w.nm}</div>${lockLine}`;
        if (unlocked) {
          card.onclick = () => { Sound.select(); this.startRun(c.id); };
        } else if (c.unlock.type === 'coins') {
          card.onclick = () => {
            if (Meta.data.coins >= c.unlock.amt) {
              Meta.data.coins -= c.unlock.amt;
              Meta.data.chars[c.id] = 1;
              Meta.save(); Sound.evolve();
              this.renderChars();
            } else { Sound.hurt(); }
          };
        }
        grid.appendChild(card);
      });
    },

    onKey(e) {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === 'playing' || this.state === 'pause') { e.preventDefault(); this.togglePause(); }
      } else if (this.state === 'levelup' && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3')) {
        const i = +e.code.slice(5) - 1;
        if (this._luChoices && this._luChoices[i]) { e.preventDefault(); this.chooseUpgrade(this._luChoices[i]); }
      } else if (this.state === 'levelup' && e.code === 'KeyR') {
        e.preventDefault(); this.reroll();
      } else if (this.state === 'gameover' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        (async () => { if (window.Ads) await Ads.interstitial(); this.startRun(this.charId); })();
      }
    },

    hideAll() {
      ['menu', 'levelup', 'pause', 'gameover', 'shop', 'howto', 'charselect', 'awards', 'settings', 'daily'].forEach(id => document.getElementById(id).classList.add('hidden'));
      document.getElementById('hud').classList.add('hidden');
    },

    showMenu() {
      this.state = 'menu';
      Sound.stopMusic();
      this.hideAll();
      document.getElementById('menu').classList.remove('hidden');
      const top = (Meta.data.scores && Meta.data.scores[0]) ? Meta.data.scores[0] : null;
      document.getElementById('best-line').textContent = top
        ? `🏆 Best: ${top.score.toLocaleString()}  ·  Lv ${top.level} · ${fmtTime(top.time)}`
        : (Meta.data.best ? `Best: Level ${Meta.data.best}` : '');
    },

    showShop() {
      this.state = 'shop';
      this.hideAll();
      document.getElementById('shop').classList.remove('hidden');
      this.renderShop();
    },

    applySettings() {
      const s = Meta.data.settings;
      Sound.musicVol = 0.32 * (s.music / 100);
      Sound.sfxVol = 0.6 * (s.sfx / 100);
      Sound.setMusicVol(Sound.musicVol);
      Sound.setSfxVol(Sound.sfxVol);
    },

    showSettings() {
      this.state = 'settings';
      this.hideAll();
      document.getElementById('settings').classList.remove('hidden');
      const s = Meta.data.settings;
      const $ = (id) => document.getElementById(id);
      $('set-music').value = s.music; $('set-sfx').value = s.sfx;
      $('set-shake').checked = !!s.shake; $('set-dmg').checked = !!s.dmg; $('set-lowq').checked = !!s.lowq;
      const save = () => { Meta.save(); this.applySettings(); };
      $('set-music').oninput = (e) => { s.music = +e.target.value; save(); };
      $('set-sfx').oninput = (e) => { s.sfx = +e.target.value; Sound.select(); save(); };
      $('set-shake').onchange = (e) => { s.shake = e.target.checked ? 1 : 0; save(); };
      $('set-dmg').onchange = (e) => { s.dmg = e.target.checked ? 1 : 0; save(); };
      $('set-lowq').onchange = (e) => { s.lowq = e.target.checked ? 1 : 0; save(); };
      $('set-reset').onclick = () => {
        if (confirm('Erase ALL progress, coins, unlocks and scores? This cannot be undone.')) {
          try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
          location.reload();
        }
      };
    },

    showDaily() {
      this.state = 'daily';
      this.hideAll();
      document.getElementById('daily').classList.remove('hidden');
      const cfg = buildDailyConfig();
      const ch = charById(cfg.pilot);
      const diff = diffById(cfg.diff);
      document.getElementById('daily-date').textContent = todayLabel() + ' · resets at UTC midnight';
      document.getElementById('daily-pilot').innerHTML = `${ch.ic} ${ch.nm} · <span style="color:var(--bad)">${diff.nm}</span>`;
      document.getElementById('daily-mods').innerHTML = cfg.mods.map(m =>
        `<div class="daily-mod"><span class="mic">${m.ic}</span><div><div class="mnm">${m.nm}</div><div class="mds">${m.ds}</div></div></div>`).join('');
      const d = Meta.data.daily;
      const isToday = d && d.seed === cfg.seed;
      document.getElementById('daily-best').textContent = (isToday && d.best)
        ? `Today's best: ${d.best.toLocaleString()}  (${d.plays} ${d.plays === 1 ? 'run' : 'runs'})`
        : 'No run today yet — set the pace!';
    },

    showAwards() {
      this.state = 'awards';
      this.hideAll();
      document.getElementById('awards').classList.remove('hidden');
      const got = ACHIEVEMENTS.filter(a => Meta.data.achievements[a.id]).length;
      document.getElementById('awards-progress').textContent = `${got} / ${ACHIEVEMENTS.length} unlocked`;
      const grid = document.getElementById('awards-grid');
      grid.innerHTML = '';
      ACHIEVEMENTS.forEach(a => {
        const has = !!Meta.data.achievements[a.id];
        const card = document.createElement('div');
        card.className = 'award-card' + (has ? ' got' : '');
        card.innerHTML = `<div class="ic">${has ? a.ic : '🔒'}</div><div class="nm">${a.nm}</div>` +
          `<div class="ds">${a.ds}</div><div class="rw">◈ ${a.reward}</div>`;
        grid.appendChild(card);
      });
    },

    renderShop() {
      document.getElementById('shop-coins').textContent = '◈ ' + Meta.data.coins;
      const grid = document.getElementById('shop-grid');
      grid.innerHTML = '';
      META_UPGRADES.forEach(u => {
        const lv = Meta.lvl(u.id);
        const maxed = lv >= u.max;
        const cost = maxed ? 0 : u.cost(lv);
        const canBuy = !maxed && Meta.data.coins >= cost;
        const pips = '●'.repeat(lv) + '○'.repeat(u.max - lv);
        const card = document.createElement('div');
        card.className = 'shop-card';
        card.innerHTML = `<div class="ic">${u.ic}</div><div class="nm">${u.nm}</div>
          <div class="ds">${u.ds}</div><div class="pips">${pips}</div>
          <button ${canBuy ? '' : 'disabled'}>${maxed ? 'MAX' : '◈ ' + cost}</button>`;
        const btn = card.querySelector('button');
        if (canBuy) btn.onclick = () => {
          Meta.data.coins -= cost;
          Meta.data.upgrades[u.id] = lv + 1;
          Meta.save();
          Sound.coin();
          this.renderShop();
        };
        grid.appendChild(card);
      });
    },

    // ---- run lifecycle ----
    startRun(charId) {
      Sound.init(); Sound.resume();
      Sound.setMuted(!!Meta.data.muted);
      this.hideAll();
      document.getElementById('hud').classList.remove('hidden');
      this.state = 'playing';
      this.isDaily = !!this._pendingDaily; this._pendingDaily = false;
      this.charId = charId || this.charId || 'vanguard';
      const ch = charById(this.charId);
      this.diff = diffById(this.isDaily ? this.dailyCfg.diff : Meta.data.difficulty);
      if (!this.isDaily) { Meta.data.lastChar = this.charId; Meta.save(); }
      this.player = new Player();
      this.enemies = []; this.bullets = []; this.enemyBullets = []; this.gems = []; this.coins = [];
      this.particles = []; this.dmgTexts = []; this.zones = []; this.orbiters = []; this.booms = []; this.pickups = [];
      this.cam = { x: 0, y: 0, shake: 0 };
      this.time = 0; this.kills = 0; this.runCoins = 0;
      this.score = 0; this.combo = 0; this.comboTimer = 0; this.bestCombo = 0;
      this.weapons = {}; this.weapons[ch.weapon] = 1;
      this.passives = {};
      this.evolved = {};
      this.weaponTimers = {};
      this.spawnAcc = 0; this.shakeAmt = 0;
      this.bossSpawned = {};
      this.pendingLevels = 0;
      this._usedContinue = false;
      this._flash = 0; this._banner = null;
      this.paused = false;
      // daily-modifier fields (default = no effect)
      this.modSpawnMul = 1; this.modBossPeriod = 90; this.modIncomingDmg = 1; this.modEnemySpeed = 1;

      // apply meta upgrades
      const p = this.player;
      p.dmgMul += Meta.lvl('might') * META_UPGRADES.find(u => u.id === 'might').val;
      p.maxHp += Meta.lvl('armor') * 8; p.hp = p.maxHp;
      p.speedMul += Meta.lvl('swift') * 0.04;
      p.fireRateMul *= Math.pow(0.96, Meta.lvl('haste'));
      p.coinMul += Meta.lvl('greed') * 0.10;
      p.xpMul += Meta.lvl('wisdom') * 0.06;
      p.pickupMul += Meta.lvl('magnet') * 0.12;
      p.regen += Meta.lvl('vitality') * 0.2;
      p.revives = Meta.lvl('revive');
      this.rerolls = 1 + Meta.lvl('luck');

      // apply character modifiers
      const m = ch.mods || {};
      if (m.hpMul) { p.maxHp = Math.round(p.maxHp * (1 + m.hpMul)); }
      p.hp = p.maxHp;
      if (m.dmgMul) p.dmgMul += m.dmgMul;
      if (m.crit) p.crit += m.crit;
      if (m.speedMul) p.speedMul += m.speedMul;
      if (m.pickupMul) p.pickupMul += m.pickupMul;
      if (m.fireRateMul) p.fireRateMul *= m.fireRateMul;
      if (m.areaMul) p.areaMul += m.areaMul;
      if (m.xpMul) p.xpMul += m.xpMul;
      if (m.regen) p.regen += m.regen;

      // apply daily-challenge modifiers
      if (this.isDaily && this.dailyMods) {
        for (const mod of this.dailyMods) mod.apply(this, p);
        p.hp = p.maxHp;
      }

      this.recalc();
      Sound.startMusic(0);
      if (window.Ads) Ads.gameplayStart();
      this.track('run_start', { pilot: this.charId, difficulty: this.diff.id, run: Meta.data.runs + 1 });
      // first-time onboarding hint
      this._hintLife = Meta.data.seenTutorial ? 0 : 4.5;
      if (!Meta.data.seenTutorial) { Meta.data.seenTutorial = 1; Meta.save(); }
      this.updateHUD();
    },

    startDaily() {
      Sound.init(); Sound.resume();
      this.dailyCfg = buildDailyConfig();
      this.dailyMods = this.dailyCfg.mods;
      this._pendingDaily = true;
      this.startRun(this.dailyCfg.pilot);
      this.track('daily_start', { seed: this.dailyCfg.seed });
    },

    endRun(record) {
      Sound.stopMusic();
      const p = this.player;
      Meta.data.runs++;
      Meta.data.coins += this.runCoins;
      Meta.data.coinsEarned = (Meta.data.coinsEarned || 0) + this.runCoins;
      Meta.data.totalKills = (Meta.data.totalKills || 0) + this.kills;
      // final score = combat score + survival/level/coin bonuses
      this.finalScore = Math.round(((this.score || 0) + Math.floor(this.time) * 8 + p.level * 200 + this.runCoins * 2) * (this.diff ? this.diff.score : 1));
      this.scoreRank = -1;
      this.dailyBest = false;
      if (record && this.isDaily) {
        const seed = todaySeed();
        if (!Meta.data.daily || Meta.data.daily.seed !== seed) Meta.data.daily = { seed, best: 0, plays: 0 };
        Meta.data.daily.plays++;
        if (this.finalScore > Meta.data.daily.best) { Meta.data.daily.best = this.finalScore; this.dailyBest = true; }
      } else if (record) {
        if (p.level > Meta.data.best) Meta.data.best = p.level;
        if (this.time > Meta.data.bestTime) Meta.data.bestTime = this.time;
        if (!Meta.data.scores) Meta.data.scores = [];
        const entry = { score: this.finalScore, level: p.level, time: Math.floor(this.time), char: this.charId, combo: this.bestCombo, date: Date.now() };
        Meta.data.scores.push(entry);
        Meta.data.scores.sort((a, b) => b.score - a.score);
        Meta.data.scores = Meta.data.scores.slice(0, 5);
        this.scoreRank = Meta.data.scores.indexOf(entry);
      }
      // milestone-based character unlocks
      this._newUnlocks = [];
      CHARACTERS.forEach(c => {
        if (Meta.hasChar(c.id)) return;
        if (c.unlock.type === 'level' && p.level >= c.unlock.amt) { Meta.data.chars[c.id] = 1; this._newUnlocks.push(c); }
        if (c.unlock.type === 'time' && this.time >= c.unlock.amt) { Meta.data.chars[c.id] = 1; this._newUnlocks.push(c); }
      });
      this._newAwards = this.checkAchievements();
      Meta.save();
      if (record) this.track('run_end', {
        score: this.finalScore, level: p.level, time: Math.floor(this.time),
        kills: this.kills, coins: this.runCoins, pilot: this.charId,
        difficulty: this.diff ? this.diff.id : 'normal', evolved: Object.keys(this.evolved || {}).length,
      });
      (this._newAwards || []).forEach(a => this.track('achievement', { id: a.id }));
    },

    checkAchievements() {
      const p = this.player;
      const stats = {
        kills: this.kills, time: this.time, level: p ? p.level : 0,
        combo: this.bestCombo || 0, evolved: Object.keys(this.evolved || {}).length,
        totalKills: Meta.data.totalKills || 0, bossKills: Meta.data.bossKills || 0,
        coinsEarned: Meta.data.coinsEarned || 0,
        allPilots: CHARACTERS.every(c => Meta.hasChar(c.id)),
      };
      const newly = [];
      for (const a of ACHIEVEMENTS) {
        if (Meta.data.achievements[a.id]) continue;
        if (a.check(stats)) {
          Meta.data.achievements[a.id] = 1;
          Meta.data.coins += a.reward;
          newly.push(a);
        }
      }
      return newly;
    },

    // recompute mirrored multipliers used by weapon code
    recalc() {
      this.dmgMul = this.player.dmgMul;
      this.areaMul = this.player.areaMul;
    },

    comboMult() { return 1 + Math.min(this.combo, 50) * 0.03; }, // up to 2.5x
    track(event, props) { if (window.Analytics) Analytics.track(event, props); },
    weaponLevel(id) { return (this.weapons[id] || 1) - 1; }, // 0-indexed for stat()
    isEvolved(id) { return !!(this.evolved && this.evolved[id]); },
    isEvolveReady(id) {
      const evo = EVOLUTIONS[id];
      if (!evo || this.isEvolved(id)) return false;
      return (this.weapons[id] || 0) >= EVO_WEAPON_REQ && (this.passives[evo.pass] || 0) >= EVO_PASSIVE_REQ;
    },

    // ---- input → player movement ----
    togglePause() {
      if (this.state === 'playing') {
        this.state = 'pause'; this.paused = true;
        document.getElementById('pause').classList.remove('hidden');
        this.renderPauseBuild();
        Sound.stopMusic();
        if (window.Ads) Ads.gameplayStop();
      } else if (this.state === 'pause') {
        this.state = 'playing'; this.paused = false;
        document.getElementById('pause').classList.add('hidden');
        Sound.startMusic(0);
        if (window.Ads) Ads.gameplayStart();
      }
    },

    renderPauseBuild() {
      const el = document.getElementById('pause-build');
      let html = '<div>';
      Object.keys(this.weapons).forEach(id => {
        const w = WEAPONS[id];
        if (this.isEvolved(id)) {
          const evo = EVOLUTIONS[id];
          html += `<span class="build-chip" style="border-color:var(--neon2)">${evo.ic} ${evo.nm} <b>★</b></span>`;
        } else {
          html += `<span class="build-chip">${w.ic} ${w.nm} <b>L${this.weapons[id]}</b></span>`;
        }
      });
      Object.keys(this.passives).forEach(id => {
        const ps = PASSIVES[id];
        html += `<span class="build-chip">${ps.ic} ${ps.nm} <b>L${this.passives[id]}</b></span>`;
      });
      // show evolution recipes the player is working toward
      const recipes = [];
      for (const id in EVOLUTIONS) {
        if (this.weapons[id] && !this.isEvolved(id)) {
          const evo = EVOLUTIONS[id];
          const pn = PASSIVES[evo.pass] ? PASSIVES[evo.pass].nm : evo.pass;
          recipes.push(`${WEAPONS[id].ic}+${PASSIVES[evo.pass].ic} → ${evo.ic} <b>${evo.nm}</b>`);
        }
      }
      if (recipes.length) {
        html += `<div style="margin-top:14px;font-size:12px;color:#8fa8cc">EVOLUTIONS<br>` +
          recipes.map(r => `<span class="build-chip" style="border-color:rgba(255,43,214,0.3)">${r}</span>`).join('') + '</div>';
      }
      html += '</div>';
      el.innerHTML = html;
    },

    // ---------------------------------------------------------------- LOOP
    loop(t) {
      const dt = Math.min(0.033, (t - this.lastTime) / 1000 || 0);
      this.lastTime = t;
      if (this.state === 'playing') {
        this.update(dt);
      }
      this.render();
      requestAnimationFrame((tt) => this.loop(tt));
    },

    update(dt) {
      const p = this.player;
      this.time += dt;

      // movement
      const mv = Input.getMove();
      if (Number.isFinite(mv.x) && Number.isFinite(mv.y)) {
        p.x += mv.x * p.speed * dt;
        p.y += mv.y * p.speed * dt;
        if (mv.x !== 0 || mv.y !== 0) {
          p.facing = Math.atan2(mv.y, mv.x);
          this._heading = p.facing;
          this._moving = true;
          // thruster particles behind the ship
          if (Math.random() < 0.7) {
            const bx = p.x - Math.cos(p.facing) * 14, by = p.y - Math.sin(p.facing) * 14;
            this.particles.push({ kind: 'spark', x: bx, y: by, vx: -Math.cos(p.facing) * 70 + rand(-25, 25), vy: -Math.sin(p.facing) * 70 + rand(-25, 25), color: '#18e0ff', life: 0.3, maxLife: 0.3, r: rand(1.5, 3) });
          }
        } else this._moving = false;
      }

      // combo decay
      if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

      // music intensity ramps with run time
      Sound.intensity = clamp(this.time / 300, 0, 1);

      // regen + timers
      if (p.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
      if (p.invuln > 0) p.invuln -= dt;
      if (p.hitFlash > 0) p.hitFlash -= dt;

      // camera follow
      this.cam.x = lerp(this.cam.x, p.x - this.W / 2, 0.12);
      this.cam.y = lerp(this.cam.y, p.y - this.H / 2, 0.12);
      if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);

      // spawning + enemy movement first, then build spatial grid for fast queries
      this.updateSpawning(dt);
      this.updateEnemies(dt);
      this.buildGrid();
      this.separateEnemies();

      // weapons (use grid for targeting/collisions)
      this.updateWeapons(dt);
      this.updateOrbiters(dt);

      // entities
      this.updateBullets(dt);
      this.updateEnemyBullets(dt);
      this.updateBooms(dt);
      this.updateZones(dt);
      this.updatePickups(dt);
      this.updateParticles(dt);
      this.updateDmgTexts(dt);

      // death
      if (p.hp <= 0) this.onDeath();

      this.updateHUD();
    },

    // ---- weapons firing ----
    updateWeapons(dt) {
      for (const id in this.weapons) {
        const w = WEAPONS[id];
        if (!w.fire) continue; // continuous weapons (orbit) handled elsewhere
        const lvl = this.weaponLevel(id);
        const stat = w.stat ? w.stat(lvl) : null;
        let cd = (stat && stat.cd ? stat.cd : 0.6) * this.player.fireRateMul;
        if (this.isEvolved(id)) cd *= 0.6;
        this.weaponTimers[id] = (this.weaponTimers[id] || 0) - dt;
        if (this.weaponTimers[id] <= 0) {
          this.weaponTimers[id] = cd;
          w.fire(this, this.player);
        }
      }
    },

    updateOrbiters(dt) {
      if (!this.weapons.orbit) { this.orbiters = []; return; }
      const s = WEAPONS.orbit.stat(this.weaponLevel('orbit'));
      const evo = this.isEvolved('orbit');
      const count = s.count + (evo ? 3 : 0);
      const dmgEach = s.dmg * (evo ? 1.8 : 1);
      // rebuild count if changed
      if (this.orbiters.length !== count) {
        this.orbiters = [];
        for (let i = 0; i < count; i++) this.orbiters.push({ a: (i / count) * TAU, hitCd: {} });
      }
      const p = this.player;
      const radius = s.radius * p.areaMul * (evo ? 1.35 : 1);
      this._orbBladeR = evo ? 16 : 9;
      for (const o of this.orbiters) {
        o.a += s.speed * (evo ? 1.25 : 1) * dt;
        o.x = p.x + Math.cos(o.a) * radius;
        o.y = p.y + Math.sin(o.a) * radius;
        // decrement hit cooldowns
        for (const k in o.hitCd) { o.hitCd[k] -= dt; if (o.hitCd[k] <= 0) delete o.hitCd[k]; }
        // damage enemies (grid-accelerated)
        const bladeR = this._orbBladeR;
        this.forEachNear(o.x, o.y, bladeR + 30, (e) => {
          const rr = (e.r + bladeR);
          if (!o.hitCd[e.id] && e.hp > 0 && dist2(o.x, o.y, e.x, e.y) < rr * rr) {
            this.damageEnemy(e, dmgEach * p.dmgMul, o.x, o.y, evo ? EVOLUTIONS.orbit.color : WEAPONS.orbit.color);
            o.hitCd[e.id] = 0.35;
          }
        });
      }
    },

    // ---- spatial hash grid (rebuilt each frame from enemy positions) ----
    cellSize: 80,
    _grid: null,
    buildGrid() {
      if (!this._grid) this._grid = new Map();
      const g = this._grid; g.clear();
      const cs = this.cellSize;
      for (const e of this.enemies) {
        const key = Math.floor(e.x / cs) + ',' + Math.floor(e.y / cs);
        let cell = g.get(key);
        if (!cell) { cell = []; g.set(key, cell); }
        cell.push(e);
      }
    },
    forEachNear(x, y, radius, cb) {
      const cs = this.cellSize, g = this._grid;
      if (!g) return;
      const mincx = Math.floor((x - radius) / cs), maxcx = Math.floor((x + radius) / cs);
      const mincy = Math.floor((y - radius) / cs), maxcy = Math.floor((y + radius) / cs);
      for (let cx = mincx; cx <= maxcx; cx++) {
        for (let cy = mincy; cy <= maxcy; cy++) {
          const cell = g.get(cx + ',' + cy);
          if (cell) for (let i = 0; i < cell.length; i++) cb(cell[i]);
        }
      }
    },
    separateEnemies() {
      const cs = this.cellSize, g = this._grid;
      for (const e of this.enemies) {
        const cx = Math.floor(e.x / cs), cy = Math.floor(e.y / cs);
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const cell = g.get((cx + ox) + ',' + (cy + oy));
            if (!cell) continue;
            for (let i = 0; i < cell.length; i++) {
              const o = cell[i];
              if (o === e || o.boss) continue;
              const dx = e.x - o.x, dy = e.y - o.y;
              const d2 = dx * dx + dy * dy;
              const min = e.r + o.r;
              if (d2 < min * min && d2 > 0.01) {
                const d = Math.sqrt(d2);
                const push = (min - d) * 0.25;
                const nx = dx / d, ny = dy / d;
                e.x += nx * push; e.y += ny * push;
                o.x -= nx * push; o.y -= ny * push;
              }
            }
          }
        }
      }
    },

    // ---- spawning / difficulty ----
    updateSpawning(dt) {
      this.spawnAcc += dt;
      const t = this.time;
      const cap = Math.min(280, 150 + Math.floor(t / 5)); // density grows over time
      if (this.enemies.length >= cap) { this.spawnAcc = 0; }
      // spawn rate ramps up over time
      const interval = clamp(0.85 - t * 0.0042, 0.16, 0.85) / ((this.diff ? this.diff.spawn : 1) * (this.modSpawnMul || 1));
      const batch = 1 + Math.floor(t / 30);
      if (this.spawnAcc >= interval && this.enemies.length < cap) {
        this.spawnAcc = 0;
        for (let i = 0; i < batch; i++) this.spawnEnemy();
      }
      // boss cadence (modifiable); doubles up after 5 minutes
      const bossWave = Math.floor(t / (this.modBossPeriod || 90));
      if (bossWave >= 1 && !this.bossSpawned[bossWave]) {
        this.bossSpawned[bossWave] = true;
        this.spawnBoss(bossWave);
        if (t > 300) this.spawnBoss(bossWave);
      }
    },

    enemyMix() {
      const t = this.time;
      const r = Math.random();
      if (t > 75 && r < 0.07) return 'brute';
      if (t > 55 && r < 0.13) return 'shooter';
      if (t > 40 && r < 0.20) return 'splitter';
      if (t > 30 && r < 0.26) return 'tank';
      if (t > 20 && r < 0.42) return 'bomber';
      if (t > 8 && r < 0.62) return 'swift';
      return 'grunt';
    },

    spawnEnemy(forceType) {
      const type = forceType || this.enemyMix();
      // Predictive spawning: while the player is moving, bias most spawns into the
      // forward arc so they can't outrun the swarm into empty space.
      let ang;
      if (this._moving && Math.random() < 0.7) {
        ang = (this._heading || 0) + rand(-1.15, 1.15);
      } else {
        ang = rand(0, TAU);
      }
      const d = Math.max(this.W, this.H) * 0.6 + rand(0, 120);
      this._createEnemy(type, this.player.x + Math.cos(ang) * d, this.player.y + Math.sin(ang) * d);
    },

    _createEnemy(type, x, y, mini) {
      const def = ENEMY_TYPES[type];
      const hpScale = (1 + this.time * 0.009) * (this.diff ? this.diff.hp : 1);
      const e = {
        id: this._eid = (this._eid || 0) + 1,
        type, x, y,
        hp: def.hp * hpScale * (mini ? 0.5 : 1), maxHp: def.hp * hpScale * (mini ? 0.5 : 1),
        speed: def.speed * rand(0.9, 1.1) * (mini ? 1.15 : 1) * (this.modEnemySpeed || 1), r: def.r * (mini ? 0.7 : 1),
        dmg: def.dmg, xp: mini ? 1 : def.xp, color: def.color, shape: def.shape,
        coin: mini ? 0.05 : def.coin, explodes: def.explodes, boss: def.boss,
        splits: mini ? false : def.splits, ranged: def.ranged,
        flash: 0, ang: 0, hitCd: 0, knockX: 0, knockY: 0,
      };
      this.enemies.push(e);
      return e;
    },

    spawnBoss(wave) {
      const def = ENEMY_TYPES.boss;
      const ang = rand(0, TAU);
      const d = Math.max(this.W, this.H) * 0.6;
      const hpScale = 1 + wave * 0.6 + this.time * 0.01;
      this.enemies.push({
        id: this._eid = (this._eid || 0) + 1,
        type: 'boss', x: this.player.x + Math.cos(ang) * d, y: this.player.y + Math.sin(ang) * d,
        hp: def.hp * hpScale, maxHp: def.hp * hpScale, speed: def.speed,
        r: def.r, dmg: def.dmg, xp: def.xp, color: def.color, shape: def.shape,
        coin: def.coin * (1 + wave), boss: true, flash: 0, ang: 0, hitCd: 0, knockX: 0, knockY: 0,
      });
      this.shake(14);
      Sound.boss();
      this.banner('⚠ BOSS INCOMING');
    },

    updateEnemies(dt) {
      const p = this.player;
      const arr = this.enemies;
      for (let i = arr.length - 1; i >= 0; i--) {
        const e = arr[i];
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        if (e.ranged) {
          // keep stand-off distance, strafe, and fire at the player
          const desired = 240;
          let mv = 0;
          if (d > desired + 50) mv = 1; else if (d < desired - 50) mv = -0.8;
          e.x += (dx / d) * e.speed * mv * dt + e.knockX * dt;
          e.y += (dy / d) * e.speed * mv * dt + e.knockY * dt;
          // strafe
          e.x += (-dy / d) * e.speed * 0.3 * dt;
          e.y += (dx / d) * e.speed * 0.3 * dt;
          e.shootCd = (e.shootCd != null ? e.shootCd : rand(0.8, 2.2)) - dt;
          if (e.shootCd <= 0 && d < 520) {
            this.spawnEnemyBullet(e.x, e.y, Math.atan2(dy, dx), e.dmg);
            e.shootCd = 2.0;
          }
        } else {
          e.x += (dx / d) * e.speed * dt + e.knockX * dt;
          e.y += (dy / d) * e.speed * dt + e.knockY * dt;
        }
        e.knockX *= 0.86; e.knockY *= 0.86;
        if (e.flash > 0) e.flash -= dt;
        if (e.hitCd > 0) e.hitCd -= dt;

        // touch damage to player
        const rr = e.r + p.r;
        if (d < rr && p.invuln <= 0) {
          this.hurtPlayer(e.dmg);
          if (e.explodes) { this.killEnemy(i, true); continue; }
        }

        // separation (cheap): push apart from a couple neighbors handled implicitly; skip for perf
        if (e.hp <= 0) { this.killEnemy(i, false); }
      }
    },

    // ---- bullets ----
    spawnBullet(x, y, ang, speed, dmg, pierce, color, r, lifeMul) {
      this.bullets.push({
        x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        dmg, pierce, color, r: r || 5, life: (lifeMul || 1) * 1.6, hit: {},
      });
    },

    spawnEnemyBullet(x, y, ang, dmg) {
      const sp = 230;
      this.enemyBullets.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 7, dmg, life: 3.5 });
    },

    updateEnemyBullets(dt) {
      const p = this.player;
      const arr = this.enemyBullets;
      for (let i = arr.length - 1; i >= 0; i--) {
        const b = arr[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        const rr = p.r + b.r;
        if (p.invuln <= 0 && dist2(b.x, b.y, p.x, p.y) < rr * rr) {
          this.hurtPlayer(b.dmg);
          arr.splice(i, 1);
          continue;
        }
        if (b.life <= 0) arr.splice(i, 1);
      }
    },

    spawnBoomerang(x, y, ang, dmg, range, color, orbit) {
      this.booms.push({
        x, y, ox: x, oy: y, ang, dmg, range, color,
        t: 0, speed: 520, phase: orbit ? 'orbit' : 'out', r: orbit ? 13 : 11, spin: 0, hit: {},
        orbit: !!orbit, orbitA: ang, life: orbit ? 3.5 : 0, hitCd: {},
      });
    },

    updateBullets(dt) {
      const arr = this.bullets;
      for (let i = arr.length - 1; i >= 0; i--) {
        const b = arr[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        let dead = b.life <= 0;
        this.forEachNear(b.x, b.y, b.r + 26, (e) => {
          if (dead || b.hit[e.id] || e.hp <= 0) return;
          const rr = e.r + b.r;
          if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
            this.damageEnemy(e, b.dmg, b.x, b.y, b.color);
            b.hit[e.id] = true;
            if (b.pierce > 0) b.pierce--;
            else dead = true;
          }
        });
        if (dead) arr.splice(i, 1);
      }
    },

    updateBooms(dt) {
      const p = this.player;
      const arr = this.booms;
      for (let i = arr.length - 1; i >= 0; i--) {
        const b = arr[i];
        b.t += dt; b.spin += dt * 16;
        if (b.phase === 'orbit') {
          b.orbitA += dt * 3.2;
          b.x = p.x + Math.cos(b.orbitA) * b.range;
          b.y = p.y + Math.sin(b.orbitA) * b.range;
          b.life -= dt;
          for (const k in b.hitCd) { b.hitCd[k] -= dt; if (b.hitCd[k] <= 0) delete b.hitCd[k]; }
          this.forEachNear(b.x, b.y, b.r + 24, (e) => {
            if (b.hitCd[e.id] || e.hp <= 0) return;
            const rr = e.r + b.r;
            if (dist2(b.x, b.y, e.x, e.y) < rr * rr) { this.damageEnemy(e, b.dmg, b.x, b.y, b.color); b.hitCd[e.id] = 0.4; }
          });
          if (b.life <= 0) arr.splice(i, 1);
          continue;
        }
        if (b.phase === 'out') {
          b.x += Math.cos(b.ang) * b.speed * dt;
          b.y += Math.sin(b.ang) * b.speed * dt;
          if (Math.hypot(b.x - b.ox, b.y - b.oy) > b.range) { b.phase = 'back'; b.hit = {}; }
        } else {
          const dx = p.x - b.x, dy = p.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          b.x += (dx / d) * (b.speed + 120) * dt;
          b.y += (dy / d) * (b.speed + 120) * dt;
          if (d < 24) { arr.splice(i, 1); continue; }
        }
        this.forEachNear(b.x, b.y, b.r + 26, (e) => {
          if (b.hit[e.id] || e.hp <= 0) return;
          const rr = e.r + b.r;
          if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
            this.damageEnemy(e, b.dmg, b.x, b.y, b.color);
            b.hit[e.id] = true;
          }
        });
      }
    },

    // ---- zones (nova) ----
    spawnZone(x, y, radius, dmg, color, implode) {
      this.zones.push({ x, y, r: 0, maxR: radius, dmg, color, hit: {}, life: 0.45, implode: !!implode });
    },

    updateZones(dt) {
      const arr = this.zones;
      for (let i = arr.length - 1; i >= 0; i--) {
        const z = arr[i];
        z.life -= dt;
        z.r = z.maxR * (1 - z.life / 0.45);
        this.forEachNear(z.x, z.y, z.r + 30, (e) => {
          if (z.hit[e.id] || e.hp <= 0) return;
          const rr = e.r + z.r;
          if (dist2(z.x, z.y, e.x, e.y) < rr * rr) {
            this.damageEnemy(e, z.dmg, e.x, e.y, z.color);
            z.hit[e.id] = true;
            const dir = z.implode ? -2.2 : 1.2;
            e.knockX += (e.x - z.x) * dir; e.knockY += (e.y - z.y) * dir;
          }
        });
        if (z.life <= 0) arr.splice(i, 1);
      }
    },

    // ---- chain lightning ----
    castChain(x, y, dmg, jumps, color) {
      let from = { x, y };
      const hitIds = {};
      let count = 0;
      Sound.tone(900, 0.08, 'square', 0.1, null, 1400);
      for (let j = 0; j <= jumps; j++) {
        // find nearest unhit enemy within range (grid-accelerated)
        let best = null, bestD = 320 * 320;
        this.forEachNear(from.x, from.y, 320, (e) => {
          if (hitIds[e.id] || e.hp <= 0) return;
          const dd = dist2(from.x, from.y, e.x, e.y);
          if (dd < bestD) { bestD = dd; best = e; }
        });
        if (!best) break;
        hitIds[best.id] = true;
        this.damageEnemy(best, dmg, best.x, best.y, color);
        this.spawnLightning(from.x, from.y, best.x, best.y, color);
        from = { x: best.x, y: best.y };
        count++;
      }
    },

    spawnLightning(x1, y1, x2, y2, color) {
      this.particles.push({ kind: 'bolt', x1, y1, x2, y2, color, life: 0.14, maxLife: 0.14 });
    },

    // ---- damage / death ----
    damageEnemy(e, dmg, fx, fy, color) {
      let d = dmg;
      let crit = false;
      if (Math.random() < this.player.crit) { d *= 2; crit = true; }
      d = Math.round(d);
      e.hp -= d;
      e.flash = 0.08;
      // thin out damage numbers when the screen is busy (keep crits)
      if (crit || this.dmgTexts.length < 45) this.spawnDmgText(e.x, e.y - e.r, d, crit, color);
      // small hit particles
      if (Math.random() < 0.4) this.spawnParticles(fx, fy, color, 2);
      if (e.hp <= 0) {
        const idx = this.enemies.indexOf(e);
        if (idx >= 0) this.killEnemy(idx, false);
      }
    },

    killEnemy(idx, exploded) {
      const e = this.enemies[idx];
      if (!e) return;
      this.enemies.splice(idx, 1);
      this.kills++;
      // combo + score
      this.combo++; this.comboTimer = 2.5;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
      this.score += Math.round((e.xp * 10 + (e.boss ? 2000 : 0)) * this.comboMult());
      this.spawnParticles(e.x, e.y, e.color, e.boss ? 30 : 7);
      Sound.kill();
      if (e.boss) { this.shake(10); this.banner('BOSS DOWN!'); Meta.data.bossKills = (Meta.data.bossKills || 0) + 1; }
      // drop xp gem
      this.gems.push({ x: e.x, y: e.y, xp: e.xp, vx: rand(-40, 40), vy: rand(-40, 40), r: 4 + Math.min(6, e.xp), pulled: false });
      // drop coin sometimes
      if (Math.random() < (e.coin || 0.1)) {
        this.coins.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), v: e.boss ? 10 : 1, r: 6, pulled: false, vx: rand(-30, 30), vy: rand(-30, 30) });
      }
      // special pickups
      if (e.boss) {
        this.spawnPickup(e.x, e.y, 'chest');
      } else {
        const r = Math.random();
        if (r < 0.010) this.spawnPickup(e.x, e.y, 'heal');
        else if (r < 0.016) this.spawnPickup(e.x, e.y, Math.random() < 0.5 ? 'magnet' : 'bomb');
      }
      if (exploded) {
        // bomber explosion damages nearby enemies + player handled in touch
        this.spawnZone(e.x, e.y, 70, 14, '#ff7a3c');
      }
      // splitters burst into two fast minis
      if (e.splits && this.enemies.length < 300) {
        for (let k = 0; k < 2; k++) this._createEnemy('grunt', e.x + rand(-22, 22), e.y + rand(-22, 22), true);
      }
    },

    hurtPlayer(dmg) {
      const p = this.player;
      dmg *= (this.diff ? this.diff.dmg : 1) * (this.modIncomingDmg || 1);
      p.hp -= dmg;
      p.invuln = 0.7;
      p.hitFlash = 0.25;
      this.shake(6);
      Sound.hurt();
      if (p.hp <= 0) { p.hp = 0; this.onDeath(); }
    },

    onDeath() {
      if (this.state !== 'playing') return; // never double-fire
      const p = this.player;
      if (p.revives > 0) {
        p.revives--;
        p.hp = p.maxHp * 0.6;
        p.invuln = 2.5;
        this.spawnZone(p.x, p.y, 260, 90, '#ffd84d');
        this.banner('REVIVED!');
        Sound.evolve();
        return;
      }
      this.state = 'gameover';
      if (window.Ads) Ads.gameplayStop();
      this.endRun(true);
      Sound.gameover();
      this.showGameOver();
    },

    shareScore() {
      const d = this.diff ? this.diff.nm : 'NORMAL';
      const text = `I scored ${(this.finalScore || 0).toLocaleString()} in NEON SWARM (${d})! ` +
        `Level ${this.player.level}, survived ${fmtTime(this.time)}. Can you beat it?`;
      const url = location.href.split('#')[0];
      const btn = document.getElementById('share-btn');
      const flash = (msg) => { if (btn) { const o = btn.textContent; btn.textContent = msg; setTimeout(() => { btn.textContent = o; }, 1600); } };
      if (navigator.share) {
        navigator.share({ title: 'NEON SWARM', text, url }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text + ' ' + url).then(() => flash('✓ COPIED!')).catch(() => flash('—'));
      } else {
        flash('—');
      }
      Sound.select();
    },

    async continueRun() {
      if (this._usedContinue) return;
      const ok = window.Ads ? await Ads.rewarded('continue') : true;
      if (!ok) return;
      this._usedContinue = true;
      this.hideAll();
      document.getElementById('hud').classList.remove('hidden');
      const p = this.player;
      p.hp = p.maxHp; p.invuln = 3;
      this.spawnZone(p.x, p.y, 620, 9999, '#ffd84d'); // clear breathing room
      this.shake(14);
      this.flash(0.5, '255,216,77');
      this.state = 'playing';
      if (window.Ads) Ads.gameplayStart();
      Sound.startMusic(0);
      this.banner('↺ BACK IN!');
    },

    showGameOver() {
      this.hideAll();
      const el = document.getElementById('gameover');
      el.classList.remove('hidden');
      document.getElementById('go-title').textContent = 'YOU DIED';
      let html = `<div style="font-size:13px;color:#8fa8cc;letter-spacing:2px">SCORE</div>` +
        `<div style="font-size:40px;font-weight:900;color:var(--neon);text-shadow:0 0 16px rgba(24,224,255,0.5);line-height:1.1">${(this.finalScore || 0).toLocaleString()}</div>`;
      if (this.scoreRank === 0) html += `<div style="color:var(--gold);font-weight:800;margin:4px 0">★ NEW HIGH SCORE!</div>`;
      else if (this.scoreRank > 0) html += `<div style="color:var(--neon2);margin:4px 0">Top ${this.scoreRank + 1} run</div>`;
      html += `<div style="margin-top:8px">Level <b>${this.player.level}</b> · Survived <b>${fmtTime(this.time)}</b><br>` +
        `Kills <b>${this.kills}</b> · Best Combo <b>${this.bestCombo}x</b> · <b style="color:var(--gold)">◈ ${this.runCoins}</b></div>`;
      if (this.isDaily) {
        html += `<div style="margin-top:10px;color:#c46bff;font-weight:800">⚡ DAILY CHALLENGE</div>` +
          (this.dailyBest ? `<div style="color:var(--gold);font-weight:800">★ NEW DAILY BEST!</div>`
            : `<div style="color:#9fb4d6">Today's best: ${((Meta.data.daily && Meta.data.daily.best) || 0).toLocaleString()}</div>`);
      }
      if (this._newUnlocks && this._newUnlocks.length) {
        html += '<br><br><span style="color:var(--neon2);font-weight:800">★ PILOT UNLOCKED</span><br>' +
          this._newUnlocks.map(c => `${c.ic} ${c.nm}`).join(' · ');
        Sound.evolve();
      }
      if (this._newAwards && this._newAwards.length) {
        const total = this._newAwards.reduce((s, a) => s + a.reward, 0);
        html += `<br><br><span style="color:var(--gold);font-weight:800">🏆 AWARD${this._newAwards.length > 1 ? 'S' : ''} (+◈${total})</span><br>` +
          this._newAwards.map(a => `${a.ic} ${a.nm}`).join(' · ');
        Sound.evolve();
      }
      document.getElementById('go-stats').innerHTML = html;
      const cont = document.getElementById('continue-btn');
      if (cont) cont.classList.toggle('hidden', this._usedContinue);
    },

    // ---- pickups: gems + coins ----
    updatePickups(dt) {
      const p = this.player;
      const pr = p.pickupR;
      const pr2 = pr * pr;
      // cap field gems for perf/clarity: sweep oldest into XP when too many pile up
      const GEM_CAP = 140;
      if (this.gems.length > GEM_CAP) {
        const excess = this.gems.length - GEM_CAP;
        let bonus = 0;
        for (let k = 0; k < excess; k++) bonus += this.gems[k].xp;
        this.gems.splice(0, excess);
        if (bonus > 0) this.gainXP(bonus);
      }
      if (this.coins.length > 80) this.coins.splice(0, this.coins.length - 80);
      if (this.pickups.length > 16) this.pickups.splice(0, this.pickups.length - 16);
      // gems: hard-pull within pickup radius, soft-drift within a wider radius so
      // kited XP is never permanently lost.
      const soft2 = (pr * 2.4) * (pr * 2.4);
      for (let i = this.gems.length - 1; i >= 0; i--) {
        const g = this.gems[i];
        const dd = dist2(g.x, g.y, p.x, p.y);
        if (g.pulled || dd < pr2) {
          g.pulled = true;
          const dx = p.x - g.x, dy = p.y - g.y; const d = Math.hypot(dx, dy) || 1;
          g.x += (dx / d) * 400 * dt; g.y += (dy / d) * 400 * dt;
          if (d < p.r + 6) { this.gainXP(g.xp); this.gems.splice(i, 1); }
        } else if (dd < soft2) {
          const dx = p.x - g.x, dy = p.y - g.y; const d = Math.hypot(dx, dy) || 1;
          g.x += (dx / d) * 150 * dt; g.y += (dy / d) * 150 * dt;
        } else {
          g.x += g.vx * dt; g.y += g.vy * dt; g.vx *= 0.9; g.vy *= 0.9;
        }
      }
      // coins
      for (let i = this.coins.length - 1; i >= 0; i--) {
        const c = this.coins[i];
        const dd = dist2(c.x, c.y, p.x, p.y);
        if (c.pulled || dd < pr2) {
          c.pulled = true;
          const dx = p.x - c.x, dy = p.y - c.y; const d = Math.hypot(dx, dy) || 1;
          c.x += (dx / d) * 420 * dt; c.y += (dy / d) * 420 * dt;
          if (d < p.r + 6) {
            const amt = Math.max(1, Math.round(c.v * p.coinMul));
            this.runCoins += amt;
            Sound.coin();
            this.coins.splice(i, 1);
          }
        } else {
          c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.9; c.vy *= 0.9;
        }
      }
      // special pickups (heal / magnet / bomb / chest)
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const k = this.pickups[i];
        k.bob += dt * 4;
        const dd = dist2(k.x, k.y, p.x, p.y);
        if (dd < pr2) { const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 1; k.x += dx / d * 220 * dt; k.y += dy / d * 220 * dt; }
        const cr = p.r + k.r + 6;
        if (dd < cr * cr) { this.applyPickup(k); this.pickups.splice(i, 1); }
      }
    },

    spawnPickup(x, y, kind) {
      this.pickups.push({ x, y, kind, r: 15, bob: Math.random() * TAU });
    },

    applyPickup(k) {
      const p = this.player;
      switch (k.kind) {
        case 'heal':
          p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
          this.spawnParticles(p.x, p.y, '#4dff9e', 18);
          Sound.levelup(); this.banner('+25% HP'); break;
        case 'magnet':
          for (const g of this.gems) g.pulled = true;
          this.spawnParticles(p.x, p.y, '#9af6ff', 14);
          Sound.coin(); this.banner('🧲 MAGNET'); break;
        case 'bomb':
          this.screenBomb(); break;
        case 'chest':
          this.runCoins += Math.round(25 * p.coinMul);
          this.pendingLevels++;
          Sound.evolve(); this.banner('🎁 SUPPLY DROP');
          this.maybeShowLevelUp(); break;
      }
    },

    screenBomb() {
      this.shake(16); Sound.boss();
      const targets = [];
      for (const e of this.enemies) {
        const sx = e.x - this.cam.x, sy = e.y - this.cam.y;
        if (sx > -60 && sx < this.W + 60 && sy > -60 && sy < this.H + 60) targets.push(e);
      }
      for (const e of targets) if (e.hp > 0) this.damageEnemy(e, 250, e.x, e.y, '#ff7a3c');
      this.spawnParticles(this.player.x, this.player.y, '#ff7a3c', 30);
      this.flash(0.45, '255,122,60');
      this.banner('💥 OVERLOAD');
    },

    gainXP(amount) {
      const p = this.player;
      p.xp += amount * p.xpMul;
      Sound.xp();
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.level++;
        p.xpNext = Math.floor(4 + p.level * 3 + Math.pow(p.level, 1.4));
        this.pendingLevels++;
      }
      this.maybeShowLevelUp();
    },

    maybeShowLevelUp() {
      if (this.state === 'playing' && this.pendingLevels > 0) {
        this.pendingLevels--;
        this.onLevelUp();
      }
    },

    nearestEnemies(x, y, n) {
      // grid-accelerated: expand search radius until enough candidates, then sort.
      if (this.enemies.length === 0) return [];
      const radii = [240, 500, 900, 1600];
      let cand = [];
      for (const R of radii) {
        const seen = new Set(); const arr = [];
        this.forEachNear(x, y, R, (e) => { if (!seen.has(e.id)) { seen.add(e.id); arr.push(e); } });
        cand = arr;
        if (arr.length >= n) break;
      }
      if (cand.length < n) cand = this.enemies.slice();
      cand.sort((a, b) => dist2(x, y, a.x, a.y) - dist2(x, y, b.x, b.y));
      return cand.slice(0, n);
    },

    // ---- level up choices ----
    onLevelUp() {
      this.state = 'levelup';
      this.flash(0.16, '24,224,255');
      Sound.levelup();
      Sound.stopMusic();
      this._luChoices = this.rollChoices();
      this.renderLevelUp();
      document.getElementById('levelup').classList.remove('hidden');
    },

    rollChoices() {
      const pool = [];
      // evolutions take priority — they are the payoff of a build
      const evos = [];
      for (const id in EVOLUTIONS) if (this.isEvolveReady(id)) evos.push({ kind: 'evolve', id });
      // weapon upgrades / new weapons
      for (const id in WEAPONS) {
        const w = WEAPONS[id];
        const cur = this.weapons[id] || 0;
        if (cur === 0) {
          if (Object.keys(this.weapons).length < 6)
            pool.push({ kind: 'weapon', id, lvl: 0, isNew: true });
        } else if (cur < w.max) {
          pool.push({ kind: 'weapon', id, lvl: cur });
        }
      }
      // passives
      for (const id in PASSIVES) {
        const ps = PASSIVES[id];
        const cur = this.passives[id] || 0;
        if (cur < ps.max) pool.push({ kind: 'passive', id, lvl: cur, isNew: cur === 0 });
      }
      // heal option fallback
      // pick up to 3 unique; force-include any ready evolutions first
      const out = [];
      for (const e of evos) { if (out.length < 3) out.push(e); }
      const copy = pool.slice();
      while (out.length < 3 && copy.length) {
        const idx = Math.floor(Math.random() * copy.length);
        out.push(copy.splice(idx, 1)[0]);
      }
      if (out.length === 0) out.push({ kind: 'heal' });
      return out;
    },

    renderLevelUp() {
      const cont = document.getElementById('lu-cards');
      cont.innerHTML = '';
      document.getElementById('reroll-count').textContent = this.rerolls;
      const rb = document.getElementById('lu-reroll');
      const out = this.rerolls <= 0;
      rb.style.opacity = out ? '0.4' : '1';
      rb.style.pointerEvents = out ? 'none' : 'auto';
      this._luChoices.forEach(c => {
        const card = document.createElement('div');
        card.className = 'lu-card';
        let ic, nm, ds, lvlText, color;
        if (c.kind === 'evolve') {
          const evo = EVOLUTIONS[c.id];
          card.className = 'lu-card evo';
          ic = evo.ic; nm = evo.nm; color = evo.color; ds = evo.ds;
          lvlText = '<span class="tag-new" style="background:var(--neon2);color:#fff">⚡ EVOLUTION</span>';
          card.innerHTML = `<div class="ic" style="color:${color}">${ic}</div>
            <div class="nm">${nm}</div><div class="lvl">${lvlText}</div><div class="ds">${ds}</div>`;
          card.onclick = () => this.chooseUpgrade(c);
          cont.appendChild(card);
          return;
        }
        if (c.kind === 'weapon') {
          const w = WEAPONS[c.id];
          ic = w.ic; nm = w.nm; color = w.color;
          ds = w.desc(c.lvl);
          lvlText = c.isNew ? '<span class="tag-new">NEW</span>' : `Level ${c.lvl} → ${c.lvl + 1}`;
          const evo = EVOLUTIONS[c.id];
          if (evo && !this.isEvolved(c.id)) {
            const pn = PASSIVES[evo.pass] ? PASSIVES[evo.pass].nm : evo.pass;
            ds += `<div style="margin-top:6px;font-size:11px;color:var(--neon2)">★ Evolves with <b>${pn}</b></div>`;
          }
        } else if (c.kind === 'passive') {
          const ps = PASSIVES[c.id];
          ic = ps.ic; nm = ps.nm; color = ps.color; ds = ps.ds;
          lvlText = c.isNew ? '<span class="tag-new">NEW</span>' : `Level ${c.lvl} → ${c.lvl + 1}`;
        } else {
          ic = '❤️'; nm = 'Full Heal'; color = '#4dff9e'; ds = 'Restore all HP.'; lvlText = '';
        }
        card.innerHTML = `<div class="ic" style="color:${color}">${ic}</div>
          <div class="nm">${nm}</div><div class="lvl">${lvlText}</div><div class="ds">${ds}</div>`;
        card.onclick = () => this.chooseUpgrade(c);
        cont.appendChild(card);
      });
    },

    reroll() {
      if (this.rerolls <= 0) return;
      this.rerolls--;
      Sound.select();
      this._luChoices = this.rollChoices();
      this.renderLevelUp();
    },

    chooseUpgrade(c) {
      Sound.select();
      if (c.kind === 'evolve') {
        this.evolved[c.id] = true;
        this.weapons[c.id] = Math.max(this.weapons[c.id] || 0, WEAPONS[c.id].max);
        Sound.evolve();
        this.shake(12);
        this.flash(0.55, '255,43,214');
        this.banner('⚡ ' + EVOLUTIONS[c.id].nm.toUpperCase());
        this.track('evolve', { weapon: c.id, level: this.player.level, time: Math.floor(this.time) });
      } else if (c.kind === 'weapon') {
        this.weapons[c.id] = (this.weapons[c.id] || 0) + 1;
      } else if (c.kind === 'passive') {
        this.passives[c.id] = (this.passives[c.id] || 0) + 1;
        PASSIVES[c.id].apply(this.player);
        this.recalc();
      } else if (c.kind === 'heal') {
        this.player.hp = this.player.maxHp;
      }
      document.getElementById('levelup').classList.add('hidden');
      this.state = 'playing';
      if (this.pendingLevels > 0) {
        this.maybeShowLevelUp();
      } else {
        Sound.startMusic(0);
      }
    },

    // ---- particles & text & banner ----
    spawnParticles(x, y, color, n) {
      if (Meta.data.settings.lowq) n = Math.ceil(n * 0.4);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), s = rand(40, 200);
        this.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, life: rand(0.2, 0.5), maxLife: 0.5, r: rand(1.5, 3.5) });
      }
    },

    updateParticles(dt) {
      const arr = this.particles;
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.life -= dt;
        if (p.kind === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
        if (p.life <= 0) arr.splice(i, 1);
      }
    },

    spawnDmgText(x, y, val, crit, color) {
      if (!Meta.data.settings.dmg && !crit) return;
      this.dmgTexts.push({ x: x + rand(-6, 6), y, val, crit, color: crit ? '#ffd84d' : '#fff', life: 0.6, vy: -50 });
    },

    updateDmgTexts(dt) {
      const arr = this.dmgTexts;
      for (let i = arr.length - 1; i >= 0; i--) {
        const t = arr[i];
        t.y += t.vy * dt; t.vy *= 0.92; t.life -= dt;
        if (t.life <= 0) arr.splice(i, 1);
      }
    },

    drawDangerVignette(ctx) {
      const p = this.player;
      if (!p) return;
      const ratio = p.hp / p.maxHp;
      if (ratio >= 0.33) return;
      const intensity = 1 - ratio / 0.33;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
      const a = 0.16 + intensity * 0.4 * pulse;
      const grd = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.22, this.W / 2, this.H / 2, this.W * 0.8);
      grd.addColorStop(0, 'rgba(255,30,60,0)');
      grd.addColorStop(1, `rgba(255,20,50,${a})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, this.W, this.H);
    },

    _flash: 0, _flashColor: '255,255,255',
    flash(amt, color) { this._flash = Math.max(this._flash, amt); if (color) this._flashColor = color; },

    _banner: null,
    banner(text) { this._banner = { text, life: 1.8 }; },

    shake(amt) { if (Meta.data.settings.shake) this.shakeAmt = Math.min(20, this.shakeAmt + amt); },

    // ---------------------------------------------------------------- RENDER
    render() {
      const ctx = this.ctx;
      ctx.fillStyle = '#05060f';
      ctx.fillRect(0, 0, this.W, this.H);

      if (this.state === 'menu' || this.state === 'shop' || this.state === 'howto' || this.state === 'charselect' || this.state === 'awards' || this.state === 'settings' || this.state === 'daily') {
        this.renderMenuBg();
        return;
      }
      if (!this.player) return;

      // parallax starfield (screen space, manual parallax)
      this.renderStars(ctx);

      ctx.save();
      let sx = 0, sy = 0;
      if (this.shakeAmt > 0) { sx = rand(-this.shakeAmt, this.shakeAmt); sy = rand(-this.shakeAmt, this.shakeAmt); }
      ctx.translate(-this.cam.x + sx, -this.cam.y + sy);

      this.renderGrid(ctx);

      // gems & coins
      for (const g of this.gems) {
        ctx.fillStyle = '#18e0ff';
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const c of this.coins) {
        ctx.fillStyle = '#ffd84d';
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#fff7d0'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      // special pickups
      if (this.pickups.length) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '26px system-ui, sans-serif';
        for (const k of this.pickups) {
          const yy = k.y + Math.sin(k.bob) * 3;
          ctx.globalCompositeOperation = 'lighter';
          const col = k.kind === 'heal' ? 'rgba(77,255,158,0.4)' : k.kind === 'chest' ? 'rgba(255,216,77,0.4)' : k.kind === 'bomb' ? 'rgba(255,122,60,0.4)' : 'rgba(154,246,255,0.4)';
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(k.x, yy, 18, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillText(k.kind === 'heal' ? '❤️' : k.kind === 'magnet' ? '🧲' : k.kind === 'bomb' ? '💣' : '🎁', k.x, yy);
        }
        ctx.textBaseline = 'alphabetic';
      }

      // zones (nova rings)
      ctx.globalCompositeOperation = 'lighter';
      for (const z of this.zones) {
        const a = clamp(z.life / 0.45, 0, 1);
        ctx.strokeStyle = z.color;
        ctx.globalAlpha = a * 0.8;
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // enemies
      for (const e of this.enemies) this.drawEnemy(ctx, e);

      // bullets
      ctx.globalCompositeOperation = 'lighter';
      for (const b of this.bullets) {
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      }
      // enemy bullets (hostile orbs)
      for (const b of this.enemyBullets) {
        ctx.fillStyle = '#ff2b6d';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,150,180,0.7)';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.5, 0, TAU); ctx.fill();
      }
      // booms
      for (const b of this.booms) {
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.spin);
        ctx.strokeStyle = b.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU * 0.7); ctx.stroke();
        ctx.restore();
      }
      // orbiters
      const orbEvo = this.isEvolved('orbit');
      const orbR = this._orbBladeR || 9;
      ctx.fillStyle = orbEvo ? EVOLUTIONS.orbit.color : WEAPONS.orbit.color;
      for (const o of this.orbiters) {
        ctx.beginPath(); ctx.arc(o.x, o.y, orbR, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // particles
      this.drawParticles(ctx);

      // player
      this.drawPlayer(ctx);

      // dmg texts
      ctx.textAlign = 'center';
      for (const t of this.dmgTexts) {
        ctx.globalAlpha = clamp(t.life / 0.6, 0, 1);
        ctx.fillStyle = t.color;
        ctx.font = (t.crit ? 'bold 22px' : 'bold 16px') + ' system-ui, sans-serif';
        ctx.fillText(t.val, t.x, t.y);
      }
      ctx.globalAlpha = 1;

      ctx.restore();

      // intensity tint: arena slowly warms toward danger-red as the run escalates
      const intensity = clamp(this.time / 360, 0, 1);
      if (intensity > 0.01) {
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = `rgba(${Math.round(120 * intensity)},${Math.round(20 * intensity)},${Math.round(60 * intensity)},${0.10 * intensity})`;
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.globalCompositeOperation = 'source-over';
      }

      // low-HP danger vignette (screen space)
      this.drawDangerVignette(ctx);

      // combo meter (screen space)
      if (this.combo >= 5) {
        const mult = this.comboMult();
        const t = clamp(this.comboTimer / 2.5, 0, 1);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.5 + 0.5 * t;
        ctx.fillStyle = mult >= 2 ? '#ff2bd6' : '#ffd84d';
        const sz = 22 + Math.min(this.combo, 50) * 0.5;
        ctx.font = `900 ${sz}px system-ui, sans-serif`;
        ctx.fillText(`${this.combo}x  ${mult.toFixed(1)}×`, this.W / 2, 78);
        // timer bar
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = ctx.fillStyle;
        ctx.fillRect(this.W / 2 - 50, 86, 100 * t, 3);
        ctx.restore();
      }

      // off-screen boss indicators (screen space)
      this.drawBossIndicators(ctx);

      // first-run onboarding hint
      if (this._hintLife > 0) {
        this._hintLife -= 0.016;
        ctx.save();
        ctx.globalAlpha = clamp(this._hintLife, 0, 1) * 0.9;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#cfe9ff';
        ctx.font = '700 18px system-ui, sans-serif';
        ctx.fillText('MOVE to dodge — your weapons fire automatically', this.W / 2, this.H * 0.62);
        ctx.font = '600 14px system-ui, sans-serif';
        ctx.fillStyle = '#8fa8cc';
        ctx.fillText('Collect XP to level up and grow your arsenal', this.W / 2, this.H * 0.62 + 26);
        ctx.restore();
      }

      // joystick (screen space)
      this.drawJoystick(ctx);

      // banner
      if (this._banner) {
        this._banner.life -= 0.016;
        if (this._banner.life <= 0) this._banner = null;
        else {
          ctx.save();
          ctx.globalAlpha = clamp(this._banner.life, 0, 1);
          ctx.fillStyle = '#ff2bd6';
          ctx.font = '900 34px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 20;
          ctx.fillText(this._banner.text, this.W / 2, this.H * 0.32);
          ctx.restore();
        }
      }

      // full-screen flash for big moments
      if (this._flash > 0.001) {
        ctx.fillStyle = `rgba(${this._flashColor},${this._flash})`;
        ctx.fillRect(0, 0, this.W, this.H);
        this._flash *= 0.86;
      }
    },

    genStars() {
      this.starLayers = [
        { par: 0.25, tile: 1400, stars: [] },
        { par: 0.5, tile: 1050, stars: [] },
      ];
      for (const L of this.starLayers) {
        const n = L.par < 0.4 ? 48 : 34;
        for (let i = 0; i < n; i++) {
          const roll = Math.random();
          L.stars.push({
            x: Math.random() * L.tile, y: Math.random() * L.tile,
            r: rand(0.6, 1.9), a: rand(0.2, 0.7),
            c: roll < 0.5 ? '#9fdcff' : roll < 0.78 ? '#ffffff' : '#ff9ad6',
          });
        }
      }
    },

    renderStars(ctx) {
      if (!this.starLayers) return;
      for (const L of this.starLayers) {
        const tile = L.tile;
        let ox = (-this.cam.x * L.par) % tile; if (ox < 0) ox += tile;
        let oy = (-this.cam.y * L.par) % tile; if (oy < 0) oy += tile;
        for (const s of L.stars) {
          for (let gx = -tile; gx <= this.W; gx += tile) {
            for (let gy = -tile; gy <= this.H; gy += tile) {
              const sx = s.x + ox + gx, sy = s.y + oy + gy;
              if (sx < -2 || sx > this.W + 2 || sy < -2 || sy > this.H + 2) continue;
              ctx.globalAlpha = s.a; ctx.fillStyle = s.c;
              ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, TAU); ctx.fill();
            }
          }
        }
      }
      ctx.globalAlpha = 1;
    },

    renderGrid(ctx) {
      const g = this.bgGrid;
      const x0 = Math.floor(this.cam.x / g) * g;
      const y0 = Math.floor(this.cam.y / g) * g;
      ctx.strokeStyle = 'rgba(40, 70, 120, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x < this.cam.x + this.W + g; x += g) {
        ctx.moveTo(x, this.cam.y); ctx.lineTo(x, this.cam.y + this.H);
      }
      for (let y = y0; y < this.cam.y + this.H + g; y += g) {
        ctx.moveTo(this.cam.x, y); ctx.lineTo(this.cam.x + this.W, y);
      }
      ctx.stroke();
    },

    drawEnemy(ctx, e) {
      ctx.save();
      ctx.translate(e.x, e.y);
      const flash = e.flash > 0;
      ctx.fillStyle = flash ? '#ffffff' : e.color;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2;
      const r = e.r;
      ctx.beginPath();
      switch (e.shape) {
        case 'tri':
          for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; const fn = i === 0 ? 'moveTo' : 'lineTo'; ctx[fn](Math.cos(a) * r, Math.sin(a) * r); }
          ctx.closePath(); break;
        case 'diamond':
          ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); break;
        case 'square':
          ctx.rect(-r, -r, r * 2, r * 2); break;
        case 'hex':
          for (let i = 0; i < 6; i++) { const a = i * TAU / 6; const fn = i === 0 ? 'moveTo' : 'lineTo'; ctx[fn](Math.cos(a) * r, Math.sin(a) * r); }
          ctx.closePath(); break;
        case 'star':
          for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.5 : r; const fn = i === 0 ? 'moveTo' : 'lineTo'; ctx[fn](Math.cos(a) * rr, Math.sin(a) * rr); }
          ctx.closePath(); break;
        default: ctx.arc(0, 0, r, 0, TAU);
      }
      ctx.globalAlpha = 0.85; ctx.fill();
      ctx.globalAlpha = 1; ctx.stroke();
      ctx.restore();
      // boss hp bar
      if (e.boss) {
        const w = 80, h = 6;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 16, w, h);
        ctx.fillStyle = '#ff2bd6';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 16, w * clamp(e.hp / e.maxHp, 0, 1), h);
      }
    },

    drawPlayer(ctx) {
      const p = this.player;
      ctx.save();
      ctx.translate(p.x, p.y);
      // pickup radius faint
      // glow
      ctx.globalCompositeOperation = 'lighter';
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 34);
      grd.addColorStop(0, 'rgba(24,224,255,0.5)');
      grd.addColorStop(1, 'rgba(24,224,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      ctx.rotate(p.facing + Math.PI / 2);
      const flash = p.hitFlash > 0 && Math.floor(p.hitFlash * 20) % 2 === 0;
      ctx.fillStyle = flash ? '#ff4d6d' : '#eaf6ff';
      ctx.strokeStyle = '#18e0ff';
      ctx.lineWidth = 2.5;
      // ship: triangle
      ctx.beginPath();
      ctx.moveTo(0, -p.r - 4);
      ctx.lineTo(p.r, p.r);
      ctx.lineTo(0, p.r * 0.4);
      ctx.lineTo(-p.r, p.r);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    },

    drawParticles(ctx) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        const a = clamp(p.life / (p.maxLife || 0.5), 0, 1);
        if (p.kind === 'bolt') {
          ctx.strokeStyle = p.color; ctx.globalAlpha = a;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          // jagged line
          const segs = 5;
          ctx.moveTo(p.x1, p.y1);
          for (let i = 1; i < segs; i++) {
            const t = i / segs;
            const mx = lerp(p.x1, p.x2, t) + rand(-10, 10);
            const my = lerp(p.y1, p.y2, t) + rand(-10, 10);
            ctx.lineTo(mx, my);
          }
          ctx.lineTo(p.x2, p.y2);
          ctx.stroke();
        } else {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },

    drawBossIndicators(ctx) {
      const margin = 36;
      for (const e of this.enemies) {
        if (!e.boss) continue;
        const sx = e.x - this.cam.x, sy = e.y - this.cam.y;
        if (sx >= 0 && sx <= this.W && sy >= 0 && sy <= this.H) continue; // on screen
        const cx = clamp(sx, margin, this.W - margin);
        const cy = clamp(sy, margin, this.H - margin);
        const ang = Math.atan2(sy - this.H / 2, sx - this.W / 2);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.fillStyle = '#ff2bd6';
        ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },

    drawJoystick(ctx) {
      if (!Input.touchActive) return;
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#18e0ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(Input.joyBaseX, Input.joyBaseY, 70, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(24,224,255,0.6)';
      ctx.beginPath(); ctx.arc(Input.joyX, Input.joyY, 28, 0, TAU); ctx.fill();
      ctx.restore();
    },

    _bgT: 0,
    renderMenuBg() {
      const ctx = this.ctx;
      this._bgT += 0.005;
      // drifting particles
      for (let i = 0; i < 40; i++) {
        const x = (Math.sin(i * 12.9 + this._bgT) * 0.5 + 0.5) * this.W;
        const y = ((i * 53.1 + this._bgT * 60) % this.H);
        ctx.fillStyle = i % 2 ? 'rgba(24,224,255,0.4)' : 'rgba(255,43,214,0.35)';
        ctx.beginPath(); ctx.arc(x, y, 1.5 + (i % 3), 0, TAU); ctx.fill();
      }
    },

    // ---- HUD ----
    updateHUD() {
      const p = this.player;
      document.getElementById('xp-fill').style.width = clamp(p.xp / p.xpNext * 100, 0, 100) + '%';
      document.getElementById('level-label').textContent = 'LV ' + p.level;
      document.getElementById('hp-fill').style.width = clamp(p.hp / p.maxHp * 100, 0, 100) + '%';
      document.getElementById('hp-text').textContent = Math.ceil(p.hp) + ' / ' + p.maxHp;
      document.getElementById('timer').textContent = fmtTime(this.time);
      document.getElementById('score').textContent = (this.score || 0).toLocaleString();
      document.getElementById('kills').textContent = '☠ ' + this.kills;
      document.getElementById('coins').textContent = '◈ ' + this.runCoins;
    },
  };

  window.Game = Game;
  window.addEventListener('DOMContentLoaded', () => Game.init());
})();
