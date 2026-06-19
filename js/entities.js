/* =========================================================================
 * HideCat — 角色与实体 (Entities)
 * Cat / WildDog / ShibaInu / PlayerDog / SafeLight / Exit
 * 全部使用 HC.art 矢量绘制，自带程序化动画。
 * ========================================================================= */
window.HC = window.HC || {};

function _dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

/* ---------------------------- 安全灯（路灯） ---------------------------- */
HC.SafeLight = class {
    constructor(x, y, radius = 165) {
        this.x = x; this.y = y;
        this.radius = radius;
        this.flicker = Math.random() * Math.PI * 2;
        this.brightness = 1;
        this.bulb = { x, y: y - 84 };
    }
    update() { this.brightness = 0.92 + Math.sin(Date.now() / 240 + this.flicker) * 0.08; }
    isInSafeZone(x, y) { return _dist(x, y, this.x, this.y) < this.radius; }
    drawPole(ctx, cam) {
        const sx = this.x - cam.x, sy = this.y - cam.y;
        const b = HC.art.drawLamp(ctx, sx, sy, this.brightness);
        this.bulb = { x: b.x + cam.x, y: b.y + cam.y };
    }
};

/* ----------------------------------- 猫 ----------------------------------- */
HC.Cat = class {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.targetX = null; this.targetY = null;
        this.vx = 0; this.vy = 0;
        this.minSpeed = 0.6; this.normalSpeed = 3.1; this.runSpeed = 5.2;
        this.maxSpeed = this.normalSpeed; this.speed = 0;
        this.accel = 0.12; this.decel = 0.18;
        this.health = 100; this.maxHealth = 100;
        this.stamina = 100; this.maxStamina = 100;
        this.size = 16;
        this.facing = 'right';
        this.phase = 0; this.idle = 0;
        this.moving = false; this.running = false;
        this.invuln = 0;
    }
    update(keys, world) {
        let dx = 0, dy = 0;
        if (keys.ArrowLeft || keys.KeyA) dx -= 1;
        if (keys.ArrowRight || keys.KeyD) dx += 1;
        if (keys.ArrowUp || keys.KeyW) dy -= 1;
        if (keys.ArrowDown || keys.KeyS) dy += 1;

        this.running = (keys.ShiftLeft || keys.ShiftRight) && this.stamina > 0;
        this.maxSpeed = this.running ? this.runSpeed : this.normalSpeed;
        if (this.running && (dx || dy)) this.stamina = Math.max(0, this.stamina - 0.55);
        else this.stamina = Math.min(this.maxStamina, this.stamina + 0.32);

        if (this.targetX !== null) {
            const mx = this.targetX - this.x, my = this.targetY - this.y;
            const d = Math.hypot(mx, my);
            if (d > 8) { dx = mx / d; dy = my / d; }
            else { this.targetX = this.targetY = null; }
        }

        this.moving = !!(dx || dy);
        if (this.moving) {
            this.speed = Math.min(this.maxSpeed, Math.max(this.speed + this.accel, this.minSpeed));
            const m = Math.hypot(dx, dy);
            this.vx = dx / m * this.speed; this.vy = dy / m * this.speed;
            if (dx > 0.01) this.facing = 'right'; else if (dx < -0.01) this.facing = 'left';
            this.phase += this.speed * 0.20; this.idle = 0;
        } else {
            this.speed = Math.max(0, this.speed - this.decel);
            this.vx *= 0.82; this.vy *= 0.82;
            if (Math.abs(this.vx) < 0.05) this.vx = 0;
            if (Math.abs(this.vy) < 0.05) this.vy = 0;
            this.idle++;
        }

        const px = this.x, py = this.y;
        let nx = this.x + this.vx, ny = this.y + this.vy;
        const r = world.resolve(nx, ny, px, py, this.size + 6);
        if (r.x === px && this.targetX !== null) this.targetX = null;
        this.x = r.x; this.y = r.y;
        this.x = Math.max(this.size, Math.min(world.W - this.size, this.x));
        this.y = Math.max(this.size, Math.min(world.H - this.size, this.y));

        if (this.invuln > 0) this.invuln--;
    }
    takeDamage(n) {
        if (this.invuln > 0) return false;
        this.health = Math.max(0, this.health - n);
        this.invuln = 50;
        return true;
    }
    draw(ctx, cam) {
        ctx.save();
        ctx.translate(this.x - cam.x, this.y - cam.y);
        if (this.invuln > 0 && Math.floor(this.invuln / 4) % 2 === 0) ctx.globalAlpha = 0.45;
        HC.art.drawCat(ctx, { phase: this.phase, idle: this.idle, moving: this.moving, running: this.running, facing: this.facing });
        ctx.restore();
    }
};

/* --------------------------------- 野狗 --------------------------------- */
HC.WildDog = class {
    constructor(x, y) {
        this.x = x; this.y = y; this.homeX = x; this.homeY = y;
        this.vx = 0; this.vy = 0;
        this.patrolSpeed = 1.4; this.minChase = 2.0; this.maxChase = 3.4;
        this.chaseSpeed = this.minChase; this.accel = 0.012;
        this.size = 18;
        this.detect = 230; this.territory = 320;
        this.state = 'patrol';
        this.phase = 0; this.facing = 'left';
        this.attackCd = 0; this.alert = 0;
        this.health = 100; this.maxHealth = 100;
        this.target = null; this.rest = 0; this.restDur = 0;
        this.name = '野狗';
        this.dead = false;
    }
    update(cat, world) {
        const catSafe = world.isInAnyLight(cat.x, cat.y);
        const dToCat = _dist(this.x, this.y, cat.x, cat.y);
        const dHome = _dist(this.x, this.y, this.homeX, this.homeY);

        if (this.state === 'patrol') {
            if (!this.target || this.needNew) {
                const ang = Math.random() * Math.PI * 2;
                const dd = Math.random() * this.territory * (Math.random() < 0.6 ? 0.35 : 0.7);
                this.target = { x: this.homeX + Math.cos(ang) * dd, y: this.homeY + Math.sin(ang) * dd };
                this.needNew = false;
            }
            const tx = this.target.x - this.x, ty = this.target.y - this.y, td = Math.hypot(tx, ty);
            if (td > 18) { this.vx = tx / td * this.patrolSpeed * 0.55; this.vy = ty / td * this.patrolSpeed * 0.55; }
            else {
                this.vx = this.vy = 0;
                this.rest = this.rest || 0; this.restDur = this.restDur || (120 + Math.random() * 160);
                if (++this.rest > this.restDur) { this.needNew = true; this.rest = 0; this.restDur = 0; }
            }
            if (dHome > this.territory * 0.85) this.target = { x: this.homeX, y: this.homeY };
            this.alert = Math.max(0, this.alert - 0.02);
            if (dToCat < this.detect && !catSafe) { this.alert += 0.06; if (this.alert >= 1) { this.state = 'chase'; this.chaseSpeed = this.minChase; } }
        } else if (this.state === 'chase') {
            if (dToCat > 6 && !catSafe) {
                this.chaseSpeed = Math.min(this.maxChase, this.chaseSpeed + this.accel);
                this.vx = (cat.x - this.x) / dToCat * this.chaseSpeed;
                this.vy = (cat.y - this.y) / dToCat * this.chaseSpeed;
                if (dToCat < 36 && this.attackCd <= 0) { if (cat.takeDamage(18)) this.attackCd = 55; }
            } else { this.vx *= 0.9; this.vy *= 0.9; }
            this.alert = 1;
            if (dHome > this.territory || catSafe || dToCat > this.detect * 1.6) { this.state = 'return'; this.alert = 0.4; }
        } else { // return
            if (dHome > 12) { this.vx = (this.homeX - this.x) / dHome * this.patrolSpeed; this.vy = (this.homeY - this.y) / dHome * this.patrolSpeed; }
            else { this.state = 'patrol'; this.chaseSpeed = this.minChase; }
            this.alert = Math.max(0, this.alert - 0.03);
        }

        const px = this.x, py = this.y;
        const r = world.resolve(this.x + this.vx, this.y + this.vy, px, py, this.size + 4);
        this.x = r.x; this.y = r.y;
        this.x = Math.max(this.size, Math.min(world.W - this.size, this.x));
        this.y = Math.max(this.size, Math.min(world.H - this.size, this.y));

        const sp = Math.hypot(this.vx, this.vy);
        if (sp > 0.1) { this.phase += sp * 0.16; this.facing = this.vx > 0 ? 'right' : (this.vx < 0 ? 'left' : this.facing); }
        if (this.attackCd > 0) this.attackCd--;
    }
    hurt(n) { this.health -= n; if (this.health <= 0) { this.health = 0; this.dead = true; } }
    draw(ctx, cam) {
        ctx.save();
        ctx.translate(this.x - cam.x, this.y - cam.y);
        HC.art.drawWildDog(ctx, { phase: this.phase, moving: Math.hypot(this.vx, this.vy) > 0.1, facing: this.facing, state: this.state });
        ctx.restore();
    }
};

/* --------------------------------- 柴犬 --------------------------------- */
HC.ShibaInu = class {
    constructor(x, y) {
        this.x = x; this.y = y; this.homeX = x; this.homeY = y;
        this.vx = 0; this.vy = 0;
        this.speed = 1.2; this.size = 20;
        this.detect = 165; this.state = 'patrol';
        this.phase = 0; this.facing = 'right';
        this.curio = 0; this.play = 0; this.rest = 0; this.target = null;
        this.health = 70; this.maxHealth = 70;
        this.name = '柴犬'; this.alert = 0; this.dead = false;
    }
    update(cat, world) {
        const catSafe = world.isInAnyLight(cat.x, cat.y);
        const dx = cat.x - this.x, dy = cat.y - this.y, dToCat = Math.hypot(dx, dy);

        if (this.state === 'patrol') {
            if (!this.target) {
                if (this.rest > 0) { this.rest--; this.vx *= 0.9; this.vy *= 0.9; }
                else { const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 150; this.target = { x: this.homeX + Math.cos(a) * d, y: this.homeY + Math.sin(a) * d }; }
            } else {
                const tx = this.target.x - this.x, ty = this.target.y - this.y, td = Math.hypot(tx, ty);
                if (td > 14) { this.vx = tx / td * this.speed * 0.6; this.vy = ty / td * this.speed * 0.6; }
                else { this.target = null; this.rest = 60 + Math.random() * 120; }
            }
            this.alert = Math.max(0, this.alert - 0.02);
            if (dToCat < this.detect && !catSafe) { this.state = 'curious'; this.curio = 0; this.target = null; }
        } else if (this.state === 'curious') {
            this.curio++; this.alert = Math.min(0.7, this.alert + 0.03);
            if (dToCat > 80) { this.vx = dx / dToCat * this.speed * 0.8; this.vy = dy / dToCat * this.speed * 0.8; }
            else if (dToCat > 50) {
                const a = this.curio * 0.02, tx = cat.x + Math.cos(a) * 70, ty = cat.y + Math.sin(a) * 70;
                const ddx = tx - this.x, ddy = ty - this.y, dd = Math.hypot(ddx, ddy);
                if (dd > 5) { this.vx = ddx / dd * this.speed * 0.5; this.vy = ddy / dd * this.speed * 0.5; }
            } else { this.vx = -dx / dToCat * this.speed * 0.3; this.vy = -dy / dToCat * this.speed * 0.3; }
            if (this.curio > 200 && dToCat < 100) { this.state = 'playful'; this.play = 0; }
            if (dToCat > this.detect * 1.5 || catSafe) { this.state = 'patrol'; this.target = null; }
        } else { // playful
            this.play++;
            const a = this.play * 0.04, rad = 60 + Math.sin(this.play * 0.02) * 20;
            const tx = cat.x + Math.cos(a) * rad, ty = cat.y + Math.sin(a) * rad;
            const ddx = tx - this.x, ddy = ty - this.y, dd = Math.hypot(ddx, ddy);
            if (dd > 5) { this.vx = ddx / dd * this.speed * 1.8; this.vy = ddy / dd * this.speed * 1.8; }
            if (this.play > 180 || dToCat > 150) { this.state = 'curious'; this.curio = 0; }
        }

        const px = this.x, py = this.y;
        const r = world.resolve(this.x + this.vx, this.y + this.vy, px, py, this.size + 4);
        this.x = r.x; this.y = r.y;
        this.vx *= 0.98; this.vy *= 0.98;
        this.x = Math.max(this.size, Math.min(world.W - this.size, this.x));
        this.y = Math.max(this.size, Math.min(world.H - this.size, this.y));

        const sp = Math.hypot(this.vx, this.vy);
        if (sp > 0.1) { this.phase += sp * 0.18; this.facing = this.vx > 0 ? 'right' : (this.vx < 0 ? 'left' : this.facing); }

        // 轻微推挤伤害
        if (dToCat < this.size + 16) {
            cat.takeDamage(0.2);
            cat.vx += -dx / dToCat * 1.5; cat.vy += -dy / dToCat * 1.5;
        }
    }
    hurt(n) { this.health -= n; if (this.health <= 0) { this.health = 0; this.dead = true; } }
    draw(ctx, cam) {
        ctx.save();
        ctx.translate(this.x - cam.x, this.y - cam.y);
        HC.art.drawShiba(ctx, { phase: this.phase, idle: this.curio, moving: Math.hypot(this.vx, this.vy) > 0.1, facing: this.facing, state: this.state });
        ctx.restore();
    }
};

/* ---------------------- 玩家控制的狗（Tab 切换） ---------------------- */
HC.PlayerDog = class {
    constructor(x, y) {
        this.x = x; this.y = y; this.vx = 0; this.vy = 0;
        this.normalSpeed = 4.0; this.runSpeed = 6.8; this.maxSpeed = this.normalSpeed;
        this.speed = 0; this.accel = 0.16; this.decel = 0.22;
        this.size = 20; this.facing = 'right'; this.phase = 0;
        this.health = 150; this.maxHealth = 150; this.biteCd = 0;
    }
    update(keys, world) {
        let dx = 0, dy = 0;
        if (keys.ArrowLeft || keys.KeyA) dx -= 1;
        if (keys.ArrowRight || keys.KeyD) dx += 1;
        if (keys.ArrowUp || keys.KeyW) dy -= 1;
        if (keys.ArrowDown || keys.KeyS) dy += 1;
        this.maxSpeed = (keys.ShiftLeft || keys.ShiftRight) ? this.runSpeed : this.normalSpeed;
        if (this.targetX !== undefined && this.targetX !== null) {
            const mx = this.targetX - this.x, my = this.targetY - this.y, d = Math.hypot(mx, my);
            if (d > 10) { dx = mx / d; dy = my / d; } else { this.targetX = this.targetY = null; }
        }
        const moving = !!(dx || dy);
        if (moving) {
            this.speed = Math.min(this.maxSpeed, this.speed + this.accel);
            const m = Math.hypot(dx, dy); this.vx = dx / m * this.speed; this.vy = dy / m * this.speed;
            if (dx > 0.01) this.facing = 'right'; else if (dx < -0.01) this.facing = 'left';
            this.phase += this.speed * 0.16;
        } else { this.speed = Math.max(0, this.speed - this.decel); this.vx *= 0.85; this.vy *= 0.85; }
        const px = this.x, py = this.y;
        const r = world.resolve(this.x + this.vx, this.y + this.vy, px, py, this.size + 4);
        this.x = r.x; this.y = r.y;
        this.x = Math.max(this.size, Math.min(world.W - this.size, this.x));
        this.y = Math.max(this.size, Math.min(world.H - this.size, this.y));
        if (this.biteCd > 0) this.biteCd--;
    }
    setTarget(x, y) { this.targetX = x; this.targetY = y; }
    draw(ctx, cam) {
        ctx.save();
        ctx.translate(this.x - cam.x, this.y - cam.y);
        HC.art.drawWildDog(ctx, { phase: this.phase, moving: Math.hypot(this.vx, this.vy) > 0.1, facing: this.facing, state: 'patrol' });
        // 玩家标识光环
        ctx.strokeStyle = 'rgba(108,140,255,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 2, 30, 12, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }
};

/* --------------------------------- 出口 --------------------------------- */
HC.Exit = class {
    constructor(x, y) { this.x = x; this.y = y; this.size = 56; this.t = 0; }
    update() { this.t += 0.06; }
    checkReached(e) { return _dist(e.x, e.y, this.x, this.y) < this.size; }
    draw(ctx, cam) {
        const sx = this.x - cam.x, sy = this.y - cam.y, A = HC.art, P = HC.palette;
        // 光晕
        const glow = this.size + Math.sin(this.t) * 8;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, glow * 1.8);
        g.addColorStop(0, 'rgba(95,217,138,0.55)'); g.addColorStop(1, 'rgba(95,217,138,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, glow * 1.8, 0, Math.PI * 2); ctx.fill();
        // 拱门
        ctx.fillStyle = '#2f6f49'; A.roundRect(ctx, sx - 34, sy - 52, 68, 92, 10); ctx.fill();
        ctx.fillStyle = P.safe; A.roundRect(ctx, sx - 27, sy - 44, 54, 80, 8); ctx.fill();
        ctx.fillStyle = '#1f5436'; A.roundRect(ctx, sx - 18, sy - 30, 36, 66, 16); ctx.fill();
        // 箭头
        ctx.fillStyle = '#eafff2';
        ctx.beginPath(); ctx.moveTo(sx, sy - 12); ctx.lineTo(sx - 11, sy + 2); ctx.lineTo(sx - 4, sy + 2);
        ctx.lineTo(sx - 4, sy + 16); ctx.lineTo(sx + 4, sy + 16); ctx.lineTo(sx + 4, sy + 2);
        ctx.lineTo(sx + 11, sy + 2); ctx.closePath(); ctx.fill();
        // 标牌
        ctx.fillStyle = P.gold; A.roundRect(ctx, sx - 30, sy - 70, 60, 16, 6); ctx.fill();
        ctx.fillStyle = P.ink; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('安全出口', sx, sy - 59);
    }
};
