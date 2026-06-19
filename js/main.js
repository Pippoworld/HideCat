/* =========================================================================
 * HideCat — 主控制 (Game / Loop / Input / Camera)
 * ========================================================================= */
window.HC = window.HC || {};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimapCanvas');
const mmCtx = minimapCanvas.getContext('2d');
const VW = canvas.width, VH = canvas.height;

class Camera {
    constructor() { this.x = 0; this.y = 0; this.tx = 0; this.ty = 0; this.shake = 0; }
    follow(t, world) {
        this.tx = Math.max(0, Math.min(world.W - VW, t.x - VW / 2));
        this.ty = Math.max(0, Math.min(world.H - VH, t.y - VH / 2));
    }
    update() {
        this.x += (this.tx - this.x) * 0.12;
        this.y += (this.ty - this.y) * 0.12;
        if (this.shake > 0) {
            this.x += (Math.random() - 0.5) * this.shake;
            this.y += (Math.random() - 0.5) * this.shake;
            this.shake *= 0.85; if (this.shake < 0.3) this.shake = 0;
        }
    }
}

HC.Game = class {
    constructor(level) {
        this.level = HC.LEVELS[level] ? level : 1;
        this.cfg = HC.LEVELS[this.level];
        this.world = new HC.World(this.level);
        this.cam = new Camera();
        this.cat = new HC.Cat(HC.CAT_START.x, HC.CAT_START.y);
        this.dogs = []; this.shibas = []; this.particles = [];
        this.playerDog = null; this.controlMode = 'cat';
        this.keys = {};
        this.minimapVisible = false;
        this.state = 'playing';
        this._spawnEnemies();
        // 让相机初始即对准
        this.cam.follow(this.cat, this.world); this.cam.x = this.cam.tx; this.cam.y = this.cam.ty;
    }

    _farFromBuildings(x, y) {
        for (const b of this.world.buildings) {
            const f = b.foot;
            if (x > f.x - 30 && x < f.x + f.w + 30 && y > f.y - 30 && y < f.y + f.h + 30) return false;
        }
        return true;
    }
    _validSpawn(x, y) {
        if (Math.hypot(x - HC.CAT_START.x, y - HC.CAT_START.y) < 520) return false;
        if (this.world.isInAnyLight(x, y)) return false;
        if (!this._farFromBuildings(x, y)) return false;
        return true;
    }
    _spawnEnemies() {
        const W = this.world.W, H = this.world.H;
        for (let i = 0; i < this.cfg.dogs; i++) {
            let x, y, tries = 0;
            do { x = 200 + Math.random() * (W - 400); y = 200 + Math.random() * (H - 400); tries++; }
            while (!this._validSpawn(x, y) && tries < 40);
            this.dogs.push(new HC.WildDog(x, y));
        }
        for (let i = 0; i < this.cfg.shibas; i++) {
            let x, y, tries = 0;
            do { x = 200 + Math.random() * (W - 400); y = 200 + Math.random() * (H - 400); tries++; }
            while (!this._validSpawn(x, y) && tries < 40);
            this.shibas.push(new HC.ShibaInu(x, y));
        }
    }

    _controlled() { return this.controlMode === 'cat' ? this.cat : (this.playerDog || this.cat); }

    spawnBurst(x, y, color, n) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
            this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 2 + Math.random() * 3, life: 1, color });
        }
    }

    update() {
        if (this.state !== 'playing') return;

        if (this.controlMode === 'cat') this.cat.update(this.keys, this.world);
        else this.playerDog.update(this.keys, this.world);

        const ctrl = this._controlled();
        this.cam.follow(ctrl, this.world); this.cam.update();

        this.world.lamps.forEach(l => l.update());
        this.dogs.forEach(d => d.update(this.cat, this.world));
        this.shibas.forEach(s => s.update(this.cat, this.world));
        this.world.exit.update();

        // 玩家狗撕咬敌人
        if (this.playerDog && this.controlMode === 'dog' && this.playerDog.biteCd <= 0) {
            const pd = this.playerDog;
            const tryBite = (e) => {
                if (e.dead) return;
                if (Math.hypot(e.x - pd.x, e.y - pd.y) < e.size + pd.size + 4) {
                    e.hurt(34); pd.biteCd = 28; this.cam.shake = 7;
                    this.spawnBurst(e.x, e.y - 20, '#ffd27a', 8);
                }
            };
            this.dogs.forEach(tryBite); this.shibas.forEach(tryBite);
        }
        // 清除被击败的敌人
        const sweep = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i].dead) { this.spawnBurst(arr[i].x, arr[i].y - 20, '#cfd6e6', 14); arr.splice(i, 1); } };
        sweep(this.dogs); sweep(this.shibas);

        // 粒子
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life -= 0.03;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        if (this.cat.invuln === 50) this.cam.shake = Math.max(this.cam.shake, 6); // 刚受击抖动

        if (this.world.exit.checkReached(this.cat)) this.win();
        if (this.cat.health <= 0) this.lose();

        this._updateHUD();
    }

    draw() {
        ctx.clearRect(0, 0, VW, VH);
        this.world.drawGround(ctx, this.cam, VW, VH);

        // 收集 Y 排序渲染对象
        const R = [];
        this.world.props.forEach(pr => R.push({ y: pr.y, fn: () => this._drawProp(pr) }));
        this.world.buildings.forEach(b => R.push({ y: b.baseY, fn: () => HC.art.drawBuilding(ctx, b.sx - this.cam.x, b.baseY - this.cam.y, b.def) }));
        this.world.lamps.forEach(l => R.push({ y: l.y, fn: () => l.drawPole(ctx, this.cam) }));
        this.dogs.forEach(d => R.push({ y: d.y, fn: () => d.draw(ctx, this.cam) }));
        this.shibas.forEach(s => R.push({ y: s.y, fn: () => s.draw(ctx, this.cam) }));
        R.push({ y: this.cat.y, fn: () => this.cat.draw(ctx, this.cam) });
        if (this.playerDog) R.push({ y: this.playerDog.y, fn: () => this.playerDog.draw(ctx, this.cam) });
        R.push({ y: this.world.exit.y, fn: () => this.world.exit.draw(ctx, this.cam) });
        R.sort((a, b) => a.y - b.y);
        R.forEach(o => o.fn());

        // 粒子（暗前）
        HC.ui.burst(ctx, this.cam, this.particles);

        // 黑暗 + 光照
        const player = this._controlled();
        HC.fx.drawDarkness(ctx, this.cam, this.world.lamps, player, VW, VH, this.cfg.dark);

        // 视野扇形 + 敌人 UI（暗之上，始终可读）
        this.dogs.forEach(d => HC.ui.visionCone(ctx, this.cam, d));
        this.dogs.forEach(d => HC.ui.enemyBadge(ctx, this.cam, d));
        this.shibas.forEach(s => HC.ui.enemyBadge(ctx, this.cam, s));

        HC.fx.drawVignette(ctx, VW, VH);

        if (this.minimapVisible) this._drawMinimap();
    }

    _drawProp(pr) {
        const sx = pr.x - this.cam.x, sy = pr.y - this.cam.y;
        if (sx < -120 || sx > VW + 120 || sy < -160 || sy > VH + 120) return;
        if (pr.type === 'tree') HC.art.drawTree(ctx, sx, sy, pr.scale);
        else if (pr.type === 'bush') HC.art.drawBush(ctx, sx, sy, pr.scale);
        else if (pr.type === 'hedge') HC.art.drawHedge(ctx, sx, sy, pr.w);
        else if (pr.type === 'fence') HC.art.drawFence(ctx, sx, sy, pr.w);
    }

    _drawMinimap() {
        const s = 150 / Math.max(this.world.W, this.world.H);
        mmCtx.clearRect(0, 0, 150, 150);
        mmCtx.fillStyle = 'rgba(10,14,30,0.85)'; mmCtx.fillRect(0, 0, 150, 150);
        mmCtx.fillStyle = 'rgba(108,140,255,0.25)';
        this.world.buildings.forEach(b => mmCtx.fillRect(b.foot.x * s, (b.baseY - 40) * s, b.def.w * s, 40 * s));
        mmCtx.fillStyle = 'rgba(255,228,150,0.6)';
        this.world.lamps.forEach(l => { mmCtx.beginPath(); mmCtx.arc(l.x * s, l.y * s, 2.5, 0, Math.PI * 2); mmCtx.fill(); });
        mmCtx.fillStyle = '#ff5d5d';
        this.dogs.forEach(d => mmCtx.fillRect(d.x * s - 1.5, d.y * s - 1.5, 3, 3));
        mmCtx.fillStyle = '#e0a261';
        this.shibas.forEach(d => mmCtx.fillRect(d.x * s - 1.5, d.y * s - 1.5, 3, 3));
        mmCtx.fillStyle = '#5fd98a';
        mmCtx.fillRect(this.world.exit.x * s - 3, this.world.exit.y * s - 3, 6, 6);
        mmCtx.fillStyle = '#fff';
        mmCtx.beginPath(); mmCtx.arc(this.cat.x * s, this.cat.y * s, 3, 0, Math.PI * 2); mmCtx.fill();
        mmCtx.strokeStyle = 'rgba(255,255,255,0.4)';
        mmCtx.strokeRect(this.cam.x * s, this.cam.y * s, VW * s, VH * s);
    }

    _updateHUD() {
        const c = this.cat;
        document.getElementById('healthFill').style.width = Math.max(0, c.health / c.maxHealth * 100) + '%';
        document.getElementById('staminaFill').style.width = Math.max(0, c.stamina / c.maxStamina * 100) + '%';
        const ctrl = this._controlled();
        const d = Math.floor(Math.hypot(this.world.exit.x - ctrl.x, this.world.exit.y - ctrl.y));
        const role = this.controlMode === 'cat' ? '🐱 猫咪' : '🐕 狗狗';
        document.getElementById('objective').textContent = `${role}　距出口 ${d}m`;
        document.getElementById('levelTag').textContent = `第 ${this.level} 关 · ${this.cfg.name}`;

        let danger = false;
        const inLight = this.world.isInAnyLight(this.cat.x, this.cat.y);
        for (const dog of this.dogs) if (dog.state === 'chase' && Math.hypot(dog.x - this.cat.x, dog.y - this.cat.y) < dog.detect) { danger = true; break; }
        const warn = document.getElementById('warning');
        warn.classList.toggle('show', danger && !inLight);
        document.getElementById('safeTag').classList.toggle('show', inLight);
    }

    win() {
        this.state = 'won';
        const last = this.level >= HC.MAX_LEVEL;
        const title = document.getElementById('gameOverTitle');
        const msg = document.getElementById('gameOverMessage');
        const btns = document.getElementById('gameOverButtons');
        if (last) {
            title.textContent = '🏆 恭喜通关！';
            msg.textContent = '你带领猫咪穿过了整片小区，逃出生天！';
            btns.innerHTML = `<button class="btn-primary" onclick="startLevel(1)">再玩一次</button><button class="btn-ghost" onclick="returnToMenu()">返回主菜单</button>`;
        } else {
            title.textContent = '🎉 关卡通过！';
            msg.textContent = `下一关：第 ${this.level + 1} 关 · ${HC.LEVELS[this.level + 1].name}`;
            btns.innerHTML = `<button class="btn-primary" onclick="nextLevel()">下一关 ▶</button><button class="btn-ghost" onclick="returnToMenu()">返回主菜单</button>`;
        }
        showOverlay('win');
    }
    lose() {
        this.state = 'lost';
        document.getElementById('gameOverTitle').textContent = '😿 被抓住了';
        document.getElementById('gameOverMessage').textContent = '别灰心，躲进灯光下再试一次！';
        document.getElementById('gameOverButtons').innerHTML =
            `<button class="btn-primary" onclick="restartGame()">重新挑战</button><button class="btn-ghost" onclick="returnToMenu()">返回主菜单</button>`;
        showOverlay('lose');
    }

    switchControl() {
        if (this.controlMode === 'cat') {
            this.controlMode = 'dog';
            if (!this.playerDog) this.playerDog = new HC.PlayerDog(this.cat.x + 30, this.cat.y);
        } else {
            this.controlMode = 'cat';
            if (this.playerDog) { this.cat.x = this.playerDog.x; this.cat.y = this.playerDog.y; }
        }
    }
    toggleMinimap() {
        this.minimapVisible = !this.minimapVisible;
        document.querySelector('.minimap').classList.toggle('show', this.minimapVisible);
    }
    handleKeyDown(e) {
        if (e.code === 'Tab') { e.preventDefault(); this.switchControl(); return; }
        if (e.code === 'Escape') { e.preventDefault(); returnToMenu(); return; }
        if (e.code === 'KeyM') { e.preventDefault(); this.toggleMinimap(); return; }
        this.keys[e.code] = true;
    }
    handleKeyUp(e) { this.keys[e.code] = false; }
    handleClick(e) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (VW / rect.width) + this.cam.x;
        const y = (e.clientY - rect.top) * (VH / rect.height) + this.cam.y;
        if (this.controlMode === 'cat') { this.cat.targetX = x; this.cat.targetY = y; }
        else if (this.playerDog) this.playerDog.setTarget(x, y);
    }
};

/* ------------------------------ 全局流程 ------------------------------ */
let game = null, rafId = null;

function gameLoop() {
    if (!game || game.state !== 'playing') { rafId = null; return; }
    game.update(); game.draw();
    rafId = requestAnimationFrame(gameLoop);
}
function startGameLoop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    rafId = requestAnimationFrame(gameLoop);
}

function launchLevel(n) {
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('levelSelect').classList.add('hidden');
    hideOverlay();
    game = new HC.Game(n);
    document.querySelector('.minimap').classList.remove('show');
    startGameLoop();
}
function startLevel(n) { launchLevel(n); }
function restartGame() { launchLevel(game ? game.level : 1); }
function nextLevel() { launchLevel(Math.min((game ? game.level : 1) + 1, HC.MAX_LEVEL)); }

function returnToMenu() {
    if (game) game.state = 'menu';
    hideOverlay();
    document.getElementById('levelSelect').classList.add('hidden');
    document.getElementById('mainMenu').classList.remove('hidden');
}
function openLevelSelect() {
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('levelSelect').classList.remove('hidden');
}
function backToMainMenu() {
    document.getElementById('levelSelect').classList.add('hidden');
    document.getElementById('mainMenu').classList.remove('hidden');
}

function showOverlay(kind) {
    const ov = document.getElementById('gameOver');
    ov.classList.remove('win', 'lose'); ov.classList.add('show', kind);
}
function hideOverlay() { document.getElementById('gameOver').classList.remove('show'); }

window.addEventListener('keydown', (e) => game && game.handleKeyDown(e));
window.addEventListener('keyup', (e) => game && game.handleKeyUp(e));
canvas.addEventListener('click', (e) => game && game.handleClick(e));

window.onload = () => {
    document.getElementById('mainMenu').classList.remove('hidden');
};
