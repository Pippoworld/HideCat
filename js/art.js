/* =========================================================================
 * HideCat — 统一扁平矢量美术系统 (Art System)
 * 所有角色 / 建筑 / 道具都由这里的程序化绘制函数生成，保证 100% 风格统一。
 * 风格基调：扁平卡通、夜晚小区、柔和双色阴影、圆润造型。
 * ========================================================================= */
window.HC = window.HC || {};

HC.palette = {
    // 环境
    voidColor:   '#0d1022',
    asphalt:     '#2b3050',
    asphaltAlt:  '#262a48',
    sidewalk:    '#3c426a',
    sidewalkAlt: '#444b76',
    roadLine:    '#e7c14d',
    grass:       '#2f6f49',
    grassAlt:    '#357a51',
    grassBlade:  '#46a06a',
    soil:        '#5b4630',

    // 建筑（小区住宅外墙的几种主色调）
    buildings: [
        { wall: '#5b6aa6', wallDark: '#48557f', roof: '#39406b' },
        { wall: '#8a6f9c', wallDark: '#6e587c', roof: '#4f3f5c' },
        { wall: '#6f9c95', wallDark: '#577a74', roof: '#3f5b56' },
        { wall: '#a88a6a', wallDark: '#876d52', roof: '#5d4b39' },
        { wall: '#9c6f6f', wallDark: '#7c5757', roof: '#5c3f3f' }
    ],
    windowLit:   '#ffd27a',
    windowLit2:  '#ffe6a8',
    windowDark:  '#2c3458',
    doorColor:   '#3a2f47',

    // 道具
    hedge:       '#357a4e',
    hedgeDark:   '#2a6240',
    fence:       '#cfd6e6',
    fenceDark:   '#9aa3bd',
    treeCanopy:  '#3a8a59',
    treeCanopy2: '#2f7049',
    treeTrunk:   '#5b4226',
    lampPole:    '#3a3f55',
    lampHead:    '#4a4f68',
    lampGlow:    '#ffe6a8',

    // 角色
    cat:    { body: '#f0a35a', belly: '#ffe2c4', stripe: '#d27c39', ear: '#e58a4a', face: '#ffe2c4' },
    dog:    { body: '#86684f', belly: '#c9a784', stripe: '#5f4838', ear: '#6e5440', rage: '#b5523c' },
    shiba:  { body: '#e0a261', belly: '#fff2e0', stripe: '#c98442', ear: '#cf8f4f', face: '#fff2e0' },

    // UI
    ink:      '#1a1f3a',
    gold:     '#ffcc4d',
    danger:   '#ff5d5d',
    safe:     '#5fd98a',
    primary:  '#6c8cff',
    panel:    'rgba(18,22,42,0.82)',
    panelEdge:'rgba(255,255,255,0.10)'
};

HC.art = (function () {
    const P = HC.palette;

    /* ---- 基础图形助手 ---- */
    function roundRect(ctx, x, y, w, h, r) {
        if (r < 0) r = 0;
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    }

    function ellipse(ctx, x, y, rx, ry, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    function shadow(ctx, rx, ry) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // 确定性伪随机（让窗户灯光等每次一致）
    function hash(n) {
        const s = Math.sin(n * 12.9898) * 43758.5453;
        return s - Math.floor(s);
    }

    /* =====================================================================
     * 角色绘制
     * 调用约定：caller 已 translate 到角色脚下中心 (0,0)，y 向下为地面。
     * a = { phase, moving, running, facing('left'|'right'), state, hurt }
     * 默认朝右；朝左时整体水平翻转。
     * ===================================================================== */

    // 一条腿（小圆角矩形），phase 控制前后摆动
    function leg(ctx, x, yTop, len, w, swing, color) {
        ctx.save();
        ctx.translate(x, yTop);
        ctx.rotate(swing);
        ctx.fillStyle = color;
        roundRect(ctx, -w / 2, 0, w, len, w / 2);
        ctx.fill();
        ctx.restore();
    }

    function setupFacing(ctx, a) {
        if (a.facing === 'left') ctx.scale(-1, 1);
    }

    function drawCat(ctx, a) {
        const c = P.cat;
        const ph = a.phase || 0;
        const moving = a.moving;
        const bob = moving ? Math.sin(ph * 2) * 2.2 : Math.sin((a.idle || 0) * 0.06) * 1.0;
        const swing = moving ? Math.sin(ph) * 0.5 : 0;

        ctx.save();
        shadow(ctx, 26, 9);
        ctx.save();
        setupFacing(ctx, a);
        ctx.translate(0, -22 + bob);

        // 后腿
        leg(ctx, 11, 8, 14, 9, -swing, c.stripe);
        leg(ctx, -2, 9, 14, 9, swing, c.stripe);

        // 尾巴（在身体后方，摆动）
        ctx.save();
        ctx.translate(-18, -2);
        ctx.rotate(Math.sin(ph * 0.8 + 1) * 0.35 - 0.3);
        ctx.fillStyle = c.body;
        roundRect(ctx, -6, -6, 28, 12, 6);
        ctx.fill();
        ctx.fillStyle = c.stripe;
        roundRect(ctx, 6, -5, 5, 10, 2); ctx.fill();
        roundRect(ctx, 14, -4, 4, 8, 2); ctx.fill();
        ctx.restore();

        // 身体
        ellipse(ctx, 0, -4, 22, 16, c.body);
        ellipse(ctx, 2, 2, 18, 11, c.belly);
        // 身体条纹
        ctx.fillStyle = c.stripe;
        for (let i = -1; i <= 1; i++) {
            roundRect(ctx, -6 + i * 9, -16, 4, 9, 2); ctx.fill();
        }

        // 前腿
        leg(ctx, 12, 6, 15, 9, swing, c.body);
        leg(ctx, 3, 7, 15, 9, -swing, c.body);

        // 头
        ctx.save();
        ctx.translate(16, -16);
        // 耳朵
        ctx.fillStyle = c.body;
        ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(-13, -22); ctx.lineTo(-2, -14); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(7, -12); ctx.lineTo(11, -23); ctx.lineTo(14, -11); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffb8a0';
        ctx.beginPath(); ctx.moveTo(-8, -12); ctx.lineTo(-10, -18); ctx.lineTo(-4, -14); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(8, -13); ctx.lineTo(10, -19); ctx.lineTo(12, -12); ctx.closePath(); ctx.fill();
        // 脸
        ellipse(ctx, 0, 0, 15, 13, c.body);
        ellipse(ctx, 2, 3, 11, 9, c.face);
        // 眼睛
        const blink = (a.idle && (a.idle % 220) < 8);
        ctx.fillStyle = P.ink;
        if (blink) {
            ctx.lineWidth = 2; ctx.strokeStyle = P.ink;
            ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(0, -1); ctx.moveTo(5, -1); ctx.lineTo(9, -1); ctx.stroke();
        } else {
            ellipse(ctx, -2, -1, 2.4, 3.2, P.ink);
            ellipse(ctx, 7, -1, 2.4, 3.2, P.ink);
            ctx.fillStyle = '#fff';
            ellipse(ctx, -1.2, -2, 0.9, 0.9, '#fff');
            ellipse(ctx, 7.8, -2, 0.9, 0.9, '#fff');
        }
        // 鼻子+嘴
        ctx.fillStyle = '#e88a86';
        ctx.beginPath(); ctx.moveTo(2, 3); ctx.lineTo(0, 5); ctx.lineTo(4, 5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = P.ink; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(2, 5); ctx.lineTo(2, 7);
        ctx.moveTo(2, 7); ctx.quadraticCurveTo(-1, 8.5, -3, 7);
        ctx.moveTo(2, 7); ctx.quadraticCurveTo(5, 8.5, 7, 7); ctx.stroke();
        ctx.restore(); // head

        ctx.restore(); // facing
        ctx.restore(); // shadow translate
    }

    function drawWildDog(ctx, a) {
        const c = P.dog;
        const rage = a.state === 'chase';
        const body = rage ? c.rage : c.body;
        const ph = a.phase || 0;
        const moving = a.moving;
        const bob = moving ? Math.sin(ph * 2) * 2.5 : 0;
        const swing = moving ? Math.sin(ph) * (rage ? 0.8 : 0.55) : 0;

        ctx.save();
        shadow(ctx, 30, 10);
        ctx.save();
        setupFacing(ctx, a);
        ctx.translate(0, -24 + bob);

        // 后腿
        leg(ctx, 14, 10, 17, 10, -swing, c.stripe);
        leg(ctx, 0, 11, 17, 10, swing, c.stripe);

        // 尾巴
        ctx.save();
        ctx.translate(-22, -6);
        ctx.rotate(-0.8 + Math.sin(ph) * 0.2);
        ctx.fillStyle = body;
        roundRect(ctx, -4, -5, 22, 10, 5); ctx.fill();
        ctx.restore();

        // 身体
        ellipse(ctx, 0, -6, 26, 18, body);
        ellipse(ctx, 2, 2, 21, 12, c.belly);

        // 前腿
        leg(ctx, 16, 8, 18, 10, swing, body);
        leg(ctx, 5, 9, 18, 10, -swing, body);

        // 头（带长吻）
        ctx.save();
        ctx.translate(21, -18);
        // 耳朵（下垂）
        ctx.fillStyle = c.ear;
        roundRect(ctx, -12, -8, 8, 16, 4); ctx.fill();
        roundRect(ctx, 6, -8, 8, 14, 4); ctx.fill();
        // 头部
        ellipse(ctx, 0, 0, 15, 13, body);
        // 吻部
        ctx.fillStyle = c.belly;
        roundRect(ctx, 8, -2, 16, 12, 5); ctx.fill();
        ctx.fillStyle = P.ink;
        ellipse(ctx, 23, 2, 3, 2.6, P.ink); // 鼻
        // 眼睛
        if (rage) {
            ctx.fillStyle = '#ffe25a';
            ellipse(ctx, 2, -2, 3, 2.4, '#ffe25a');
            ctx.fillStyle = P.ink;
            ellipse(ctx, 3, -2, 1.3, 1.8, P.ink);
            // 怒眉
            ctx.strokeStyle = P.ink; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-3, -7); ctx.lineTo(6, -3); ctx.stroke();
        } else {
            ellipse(ctx, 2, -2, 2.4, 3, P.ink);
        }
        // 嘴（露齿）
        if (rage) {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.moveTo(12, 9); ctx.lineTo(15, 13); ctx.lineTo(18, 9); ctx.closePath(); ctx.fill();
        }
        ctx.restore();

        ctx.restore();
        ctx.restore();
    }

    function drawShiba(ctx, a) {
        const c = P.shiba;
        const ph = a.phase || 0;
        const moving = a.moving;
        const playful = a.state === 'playful';
        const bob = moving ? Math.sin(ph * 2) * (playful ? 3.2 : 2.2) : Math.sin((a.idle || 0) * 0.05) * 1.0;
        const swing = moving ? Math.sin(ph) * (playful ? 0.7 : 0.5) : 0;

        ctx.save();
        shadow(ctx, 28, 10);
        ctx.save();
        setupFacing(ctx, a);
        ctx.translate(0, -24 + bob);

        // 后腿
        leg(ctx, 13, 9, 15, 9, -swing, c.stripe);
        leg(ctx, -1, 10, 15, 9, swing, c.stripe);

        // 卷尾巴（柴犬标志）
        ctx.save();
        ctx.translate(-18, -14);
        ctx.rotate(Math.sin(ph) * 0.15);
        ctx.fillStyle = c.body;
        ctx.beginPath();
        ctx.arc(0, 0, 11, Math.PI * 0.2, Math.PI * 1.7);
        ctx.lineTo(0, 0);
        ctx.fill();
        ctx.fillStyle = c.belly;
        ctx.beginPath(); ctx.arc(0, 0, 6, Math.PI * 0.2, Math.PI * 1.7); ctx.lineTo(0, 0); ctx.fill();
        ctx.restore();

        // 身体
        ellipse(ctx, 0, -5, 23, 16, c.body);
        ellipse(ctx, 2, 2, 18, 11, c.belly);

        // 前腿
        leg(ctx, 14, 7, 16, 9, swing, c.body);
        leg(ctx, 4, 8, 16, 9, -swing, c.body);

        // 头
        ctx.save();
        ctx.translate(17, -16);
        // 尖耳
        ctx.fillStyle = c.body;
        ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(-13, -20); ctx.lineTo(-3, -12); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(6, -10); ctx.lineTo(10, -21); ctx.lineTo(13, -9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd9b0';
        ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(-10, -16); ctx.lineTo(-5, -12); ctx.closePath(); ctx.fill();
        // 脸
        ellipse(ctx, 0, 0, 14, 12, c.body);
        // 白吻
        ctx.fillStyle = c.face;
        roundRect(ctx, 2, -2, 14, 12, 6); ctx.fill();
        ellipse(ctx, 0, 6, 9, 6, c.face);
        // 眼+腮红
        ctx.fillStyle = P.ink;
        ellipse(ctx, -3, -1, 2.2, 3, P.ink);
        ellipse(ctx, 7, -1, 2.2, 3, P.ink);
        ctx.fillStyle = 'rgba(232,138,134,0.45)';
        ellipse(ctx, -6, 4, 3, 2, 'rgba(232,138,134,0.45)');
        ellipse(ctx, 10, 4, 3, 2, 'rgba(232,138,134,0.45)');
        // 鼻+笑嘴
        ellipse(ctx, 6, 3, 2.4, 2, P.ink);
        ctx.strokeStyle = P.ink; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(6, 5); ctx.quadraticCurveTo(2, 9, -2, 6);
        ctx.moveTo(6, 5); ctx.quadraticCurveTo(10, 9, 13, 6); ctx.stroke();
        ctx.restore();

        ctx.restore();
        ctx.restore();
    }

    /* =====================================================================
     * 场景道具 / 建筑（屏幕坐标绘制）
     * ===================================================================== */

    // 小区住宅楼：脚点 (sx, baseY) 为楼底中心
    function drawBuilding(ctx, sx, baseY, def) {
        const w = def.w, h = def.h;
        const x = sx - w / 2;
        const y = baseY - h;
        const col = P.buildings[def.colorIndex % P.buildings.length];

        // 楼体
        ctx.fillStyle = col.wall;
        roundRect(ctx, x, y, w, h, 6); ctx.fill();
        // 右侧暗面（简单立体感）
        ctx.fillStyle = col.wallDark;
        roundRect(ctx, x + w * 0.72, y, w * 0.28, h, 6); ctx.fill();
        // 屋顶
        ctx.fillStyle = col.roof;
        roundRect(ctx, x - 4, y - 10, w + 8, 16, 5); ctx.fill();
        // 顶部水箱/楼梯间
        ctx.fillStyle = col.wallDark;
        roundRect(ctx, x + w * 0.2, y - 22, w * 0.25, 14, 3); ctx.fill();

        // 窗户网格
        const cols = def.cols, rows = def.rows;
        const pad = 12;
        const cw = (w - pad * 2) / cols;
        const ch = (h - pad * 2 - 26) / rows; // 底部留门空间
        const winW = cw * 0.62, winH = ch * 0.58;
        for (let r = 0; r < rows; r++) {
            for (let cI = 0; cI < cols; cI++) {
                const wx = x + pad + cw * cI + (cw - winW) / 2;
                const wy = y + pad + ch * r + (ch - winH) / 2;
                const lit = hash(def.seed + r * 7 + cI * 13) < def.litRatio;
                ctx.fillStyle = lit ? P.windowLit : P.windowDark;
                roundRect(ctx, wx, wy, winW, winH, 2); ctx.fill();
                if (lit) {
                    ctx.fillStyle = 'rgba(255,255,255,0.15)';
                    roundRect(ctx, wx, wy, winW, winH * 0.4, 2); ctx.fill();
                }
                // 窗框横档
                ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(wx, wy + winH / 2); ctx.lineTo(wx + winW, wy + winH / 2);
                ctx.moveTo(wx + winW / 2, wy); ctx.lineTo(wx + winW / 2, wy + winH); ctx.stroke();
            }
        }

        // 大门
        const dW = Math.min(34, w * 0.26), dH = 30;
        ctx.fillStyle = P.doorColor;
        roundRect(ctx, sx - dW / 2, baseY - dH, dW, dH, 4); ctx.fill();
        ctx.fillStyle = P.windowLit2;
        roundRect(ctx, sx - dW / 2 + 3, baseY - dH + 3, dW - 6, 8, 2); ctx.fill();
        // 门牌单元号
        ctx.fillStyle = '#ffe6a8'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(def.unit || '1', sx, baseY - dH - 3);
    }

    function drawHedge(ctx, sx, sy, w) {
        const h = 18;
        ctx.fillStyle = P.hedgeDark;
        roundRect(ctx, sx - w / 2, sy - h, w, h + 6, 9); ctx.fill();
        ctx.fillStyle = P.hedge;
        for (let i = -w / 2 + 8; i < w / 2; i += 14) {
            ellipse(ctx, sx + i, sy - h + 4, 9, 8, P.hedge);
        }
    }

    function drawFence(ctx, sx, sy, w) {
        ctx.strokeStyle = P.fenceDark; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx - w / 2, sy - 6); ctx.lineTo(sx + w / 2, sy - 6);
        ctx.moveTo(sx - w / 2, sy - 16); ctx.lineTo(sx + w / 2, sy - 16); ctx.stroke();
        ctx.fillStyle = P.fence;
        for (let i = -w / 2; i <= w / 2; i += 12) {
            roundRect(ctx, sx + i - 1.5, sy - 24, 3, 26, 1.5); ctx.fill();
        }
    }

    function drawTree(ctx, sx, sy, scale) {
        scale = scale || 1;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(scale, scale);
        ctx.fillStyle = P.treeTrunk;
        roundRect(ctx, -5, -28, 10, 30, 3); ctx.fill();
        ctx.fillStyle = P.treeCanopy2;
        ellipse(ctx, 0, -40, 24, 22, P.treeCanopy2);
        ctx.fillStyle = P.treeCanopy;
        ellipse(ctx, -8, -46, 16, 15, P.treeCanopy);
        ellipse(ctx, 9, -42, 14, 13, P.treeCanopy);
        ctx.restore();
    }

    function drawBush(ctx, sx, sy, scale) {
        scale = scale || 1;
        ctx.save(); ctx.translate(sx, sy); ctx.scale(scale, scale);
        ctx.fillStyle = P.hedgeDark; ellipse(ctx, 0, 0, 18, 12, P.hedgeDark);
        ctx.fillStyle = P.hedge;
        ellipse(ctx, -7, -4, 10, 9, P.hedge);
        ellipse(ctx, 6, -3, 9, 8, P.hedge);
        ctx.restore();
    }

    // 路灯（矢量），返回灯泡屏幕坐标供光照使用
    function drawLamp(ctx, sx, baseY, brightness) {
        const poleH = 96;
        const topY = baseY - poleH;
        // 杆
        ctx.fillStyle = P.lampPole;
        roundRect(ctx, sx - 4, topY, 8, poleH, 4); ctx.fill();
        // 底座
        ctx.fillStyle = P.lampHead;
        roundRect(ctx, sx - 10, baseY - 10, 20, 12, 4); ctx.fill();
        // 灯臂
        ctx.fillStyle = P.lampPole;
        roundRect(ctx, sx - 4, topY, 22, 6, 3); ctx.fill();
        // 灯头
        const hx = sx + 16, hy = topY + 4;
        ctx.fillStyle = P.lampHead;
        ctx.beginPath();
        ctx.moveTo(hx - 12, hy); ctx.lineTo(hx + 12, hy);
        ctx.lineTo(hx + 8, hy + 12); ctx.lineTo(hx - 8, hy + 12); ctx.closePath(); ctx.fill();
        // 灯泡发光
        ctx.fillStyle = `rgba(255,236,160,${0.85 * brightness})`;
        roundRect(ctx, hx - 7, hy + 9, 14, 7, 3); ctx.fill();
        const g = ctx.createRadialGradient(hx, hy + 12, 0, hx, hy + 12, 26);
        g.addColorStop(0, `rgba(255,236,168,${0.5 * brightness})`);
        g.addColorStop(1, 'rgba(255,236,168,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(hx, hy + 12, 26, 0, Math.PI * 2); ctx.fill();
        return { x: hx, y: hy + 12 };
    }

    return {
        roundRect, ellipse, hash,
        drawCat, drawWildDog, drawShiba,
        drawBuilding, drawHedge, drawFence, drawTree, drawBush, drawLamp
    };
})();
