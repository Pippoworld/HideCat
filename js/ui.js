/* =========================================================================
 * HideCat — 视觉特效与敌人 UI (FX + Enemy UI)
 * 夜晚黑暗光照、暗角、敌人浮动血条 / 警觉条 / 状态徽章 / 名牌 / 视野扇形。
 * ========================================================================= */
window.HC = window.HC || {};

HC.fx = (function () {
    let off = null, offCtx = null;
    function ensure(w, h) {
        if (!off || off.width !== w || off.height !== h) {
            off = document.createElement('canvas'); off.width = w; off.height = h;
            offCtx = off.getContext('2d');
        }
    }

    // 黑暗遮罩 + 路灯挖洞 + 玩家随身微光
    function drawDarkness(ctx, cam, lamps, player, vw, vh, darkAlpha) {
        ensure(vw, vh);
        offCtx.clearRect(0, 0, vw, vh);
        offCtx.fillStyle = `rgba(6,8,20,${darkAlpha})`;
        offCtx.fillRect(0, 0, vw, vh);
        offCtx.globalCompositeOperation = 'destination-out';

        lamps.forEach(l => {
            const sx = l.x - cam.x, sy = l.y - cam.y - 20;
            if (sx < -l.radius || sx > vw + l.radius || sy < -l.radius || sy > vh + l.radius) return;
            const g = offCtx.createRadialGradient(sx, sy, 0, sx, sy, l.radius);
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(0.66, 'rgba(255,255,255,1)');
            g.addColorStop(0.82, 'rgba(255,255,255,0.55)');
            g.addColorStop(0.93, 'rgba(255,255,255,0.18)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            offCtx.fillStyle = g;
            offCtx.beginPath(); offCtx.arc(sx, sy, l.radius, 0, Math.PI * 2); offCtx.fill();
        });

        if (player) {
            const px = player.x - cam.x, py = player.y - cam.y;
            const pr = 130;
            const g = offCtx.createRadialGradient(px, py, 0, px, py, pr);
            g.addColorStop(0, 'rgba(255,255,255,0.85)');
            g.addColorStop(0.6, 'rgba(255,255,255,0.4)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            offCtx.fillStyle = g;
            offCtx.beginPath(); offCtx.arc(px, py, pr, 0, Math.PI * 2); offCtx.fill();
        }
        offCtx.globalCompositeOperation = 'source-over';

        ctx.drawImage(off, 0, 0);

        // 灯泡暖色光晕（叠加）
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        lamps.forEach(l => {
            const sx = l.x - cam.x, sy = l.y - cam.y - 20;
            const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, l.radius * 0.9);
            g.addColorStop(0, `rgba(255,228,150,${0.22 * l.brightness})`);
            g.addColorStop(1, 'rgba(255,228,150,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, l.radius * 0.9, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
    }

    function drawVignette(ctx, vw, vh) {
        const g = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.35, vw / 2, vh / 2, vw * 0.72);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }

    return { drawDarkness, drawVignette };
})();

HC.ui = (function () {
    const P = HC.palette, A = HC.art;

    // 野狗视野扇形（地面层，敌人之前绘制）
    function visionCone(ctx, cam, dog) {
        if (dog.dead) return;
        const sx = dog.x - cam.x, sy = dog.y - cam.y;
        const dir = dog.facing === 'right' ? 0 : Math.PI;
        const half = 0.5; // 扇形半角
        const r = dog.detect;
        const chasing = dog.state === 'chase';
        const col = chasing ? '255,93,93' : '255,210,120';
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, `rgba(${col},${chasing ? 0.20 : 0.10})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.save();
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.arc(sx, sy, r, dir - half, dir + half);
        ctx.closePath(); ctx.fill();
        ctx.restore();
    }

    // 敌人浮动 UI：名牌 + 血条 + 警觉条 + 状态徽章
    function enemyBadge(ctx, cam, e) {
        if (e.dead) return;
        const sx = e.x - cam.x, sy = e.y - cam.y;
        const topY = sy - 58; // 头顶上方
        const w = 46;

        const hurt = e.health < e.maxHealth;
        const showAlert = e.alert > 0.05 && e.state !== 'chase';
        const chasing = e.state === 'chase';
        const curious = e.state === 'curious' || e.state === 'playful';

        // 仅在“有威胁/受伤/被察觉”时显示，避免画面杂乱
        if (!hurt && !showAlert && !chasing && !curious) return;

        // 名牌
        ctx.save();
        ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
        const tw = ctx.measureText(e.name).width + 14;
        ctx.fillStyle = 'rgba(12,16,34,0.78)';
        A.roundRect(ctx, sx - tw / 2, topY - 14, tw, 14, 7); ctx.fill();
        ctx.fillStyle = chasing ? P.danger : (curious ? P.gold : '#cfd6e6');
        ctx.fillText(e.name, sx, topY - 3);
        ctx.restore();

        // 血条
        if (hurt) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            A.roundRect(ctx, sx - w / 2, topY + 2, w, 6, 3); ctx.fill();
            const hp = Math.max(0, e.health / e.maxHealth);
            ctx.fillStyle = hp > 0.5 ? P.safe : (hp > 0.25 ? P.gold : P.danger);
            A.roundRect(ctx, sx - w / 2 + 1, topY + 3, (w - 2) * hp, 4, 2); ctx.fill();
        }

        // 警觉条（被发现的过程）
        if (showAlert) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            A.roundRect(ctx, sx - w / 2, topY + 10, w, 5, 2.5); ctx.fill();
            ctx.fillStyle = P.gold;
            A.roundRect(ctx, sx - w / 2 + 1, topY + 11, (w - 2) * Math.min(1, e.alert), 3, 1.5); ctx.fill();
        }

        // 状态徽章
        let badge = null, bg = null;
        if (chasing) { badge = '!'; bg = P.danger; }
        else if (e.state === 'playful') { badge = '♪'; bg = '#ff7ab5'; }
        else if (curious) { badge = '?'; bg = P.gold; }
        if (badge) {
            const bx = sx + w / 2 + 8, by = topY + 4;
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
            ctx.fillText(badge, bx, by + 4);
        }
    }

    // 命中/击败的小粒子
    function burst(ctx, cam, parts) {
        for (const p of parts) {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, p.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    return { visionCone, enemyBadge, burst };
})();
