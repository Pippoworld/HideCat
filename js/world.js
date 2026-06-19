/* =========================================================================
 * HideCat — 世界 / 小区场景生成 (World)
 * 生成住宅小区：路网、住宅楼（实体障碍）、路灯（安全区）、绿化、出口。
 * 同时负责地面渲染与建筑碰撞。
 * ========================================================================= */
window.HC = window.HC || {};

HC.WORLD_W = 3200;
HC.WORLD_H = 3200;

// 关卡配置：难度递进 + 主题微调
HC.LEVELS = {
    1: { name: '黎明小区',  dogs: 6,  shibas: 5, lampSkip: 0, tint: 'rgba(40,52,96,0.30)', dark: 0.46 },
    2: { name: '梧桐花园',  dogs: 9,  shibas: 6, lampSkip: 1, tint: 'rgba(30,40,80,0.40)', dark: 0.55 },
    3: { name: '中央街区',  dogs: 12, shibas: 7, lampSkip: 1, tint: 'rgba(22,30,66,0.48)', dark: 0.62 },
    4: { name: '滨河新城',  dogs: 15, shibas: 8, lampSkip: 2, tint: 'rgba(16,24,56,0.55)', dark: 0.68 },
    5: { name: '午夜旧城',  dogs: 19, shibas: 9, lampSkip: 2, tint: 'rgba(10,16,44,0.62)', dark: 0.74 }
};
HC.MAX_LEVEL = 5;

HC.CAT_START = { x: 360, y: 360 };

HC.World = class {
    constructor(level) {
        const A = HC.art, P = HC.palette;
        this.level = HC.LEVELS[level] ? level : 1;
        this.cfg = HC.LEVELS[this.level];
        this.W = HC.WORLD_W;
        this.H = HC.WORLD_H;

        this.roads = [];       // {x,y,w,h,horizontal}
        this.buildings = [];   // {sx, baseY, def, foot:{x,y,w,h}}
        this.props = [];       // 装饰：tree/hedge/fence/bush
        this.lamps = [];       // 安全灯（路灯）
        this.exit = null;

        this._buildGrid();
    }

    _buildGrid() {
        const block = 540;       // 街区间距
        const roadW = 120;       // 路宽
        const margin = 40;
        const cfg = this.cfg;

        // 路网
        const xs = [], ys = [];
        for (let x = block; x < this.W - block / 2; x += block) {
            this.roads.push({ x: x - roadW / 2, y: 0, w: roadW, h: this.H, horizontal: false });
            xs.push(x);
        }
        for (let y = block; y < this.H - block / 2; y += block) {
            this.roads.push({ x: 0, y: y - roadW / 2, w: this.W, h: roadW, horizontal: true });
            ys.push(y);
        }

        // 路灯：沿路口与路段，lampSkip 越大灯越稀（越难）
        let lampIdx = 0;
        const fullX = [0, ...xs, this.W];
        const fullY = [0, ...ys, this.H];
        for (let i = 0; i < xs.length; i++) {
            for (let j = 0; j < ys.length; j++) {
                if (cfg.lampSkip && (i + j) % (cfg.lampSkip + 1) !== 0) { lampIdx++; continue; }
                this.lamps.push(new HC.SafeLight(xs[i] + roadW / 2 + 14, ys[j] + roadW / 2 + 14));
                lampIdx++;
            }
        }
        // 保证出生点附近有灯
        this.lamps.push(new HC.SafeLight(HC.CAT_START.x + 70, HC.CAT_START.y + 70));

        // 住宅楼 + 绿化：填充每个街区内部
        const cells = [];
        for (let i = 0; i <= xs.length; i++) {
            for (let j = 0; j <= ys.length; j++) {
                const x0 = (i === 0 ? margin : xs[i - 1] + roadW / 2);
                const x1 = (i === xs.length ? this.W - margin : xs[i] - roadW / 2);
                const y0 = (j === 0 ? margin : ys[j - 1] + roadW / 2);
                const y1 = (j === ys.length ? this.H - margin : ys[j] - roadW / 2);
                cells.push({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
            }
        }

        let unit = 1;
        cells.forEach((cell, idx) => {
            const cw = cell.x1 - cell.x0, chh = cell.y1 - cell.y0;
            if (cw < 120 || chh < 120) return;

            // 出生点所在街区留空（安全广场）
            if (HC.CAT_START.x > cell.x0 - 60 && HC.CAT_START.x < cell.x1 + 60 &&
                HC.CAT_START.y > cell.y0 - 60 && HC.CAT_START.y < cell.y1 + 60) {
                this._greenery(cell, true);
                return;
            }

            // 放 1 栋住宅楼在街区上半部
            const bw = Math.min(cw - 70, 150 + (idx % 3) * 26);
            const bh = 150 + (idx % 4) * 34;
            const baseY = cell.cy + 14;
            const sx = cell.cx;
            const def = {
                w: bw, h: bh,
                cols: 3 + (idx % 2), rows: 3 + (idx % 3),
                colorIndex: idx % HC.palette.buildings.length,
                seed: idx * 37 + 11,
                litRatio: 0.45,
                unit: String(unit++)
            };
            const footH = 30;
            this.buildings.push({
                sx, baseY, def,
                foot: { x: sx - bw / 2, y: baseY - footH / 2, w: bw, h: footH }
            });

            this._greenery(cell, false);
        });

        // 出口：放在距出生点最远的地图边角
        this.exit = new HC.Exit(this.W - 200, this.H - 200);

        // 围栏沿外边缘点缀
        for (let x = 200; x < this.W - 200; x += 260) {
            this.props.push({ type: 'fence', x, y: 70, w: 120 });
            this.props.push({ type: 'fence', x, y: this.H - 60, w: 120 });
        }
    }

    _greenery(cell, isPlaza) {
        const r = (n) => HC.art.hash(cell.cx * 0.013 + cell.cy * 0.017 + n);
        const count = isPlaza ? 5 : 3;
        for (let k = 0; k < count; k++) {
            const x = cell.x0 + 24 + r(k) * (cell.x1 - cell.x0 - 48);
            const y = cell.y0 + 30 + r(k + 9) * (cell.y1 - cell.y0 - 48);
            const t = r(k + 3);
            if (t < 0.4) this.props.push({ type: 'tree', x, y, scale: 0.85 + r(k + 5) * 0.5 });
            else if (t < 0.7) this.props.push({ type: 'bush', x, y, scale: 0.8 + r(k + 6) * 0.5 });
            else this.props.push({ type: 'hedge', x, y, w: 60 + r(k + 7) * 50 });
        }
    }

    /* ---- 建筑碰撞：分轴解析，返回允许的新坐标 ---- */
    resolve(x, y, prevX, prevY, radius) {
        let nx = x, ny = y;
        for (const b of this.buildings) {
            const f = b.foot;
            // X 轴
            if (this._overlap(nx, prevY, radius, f)) nx = prevX;
            // Y 轴
            if (this._overlap(prevX, ny, radius, f)) ny = prevY;
        }
        return { x: nx, y: ny };
    }

    _overlap(cx, cy, r, f) {
        const closestX = Math.max(f.x, Math.min(cx, f.x + f.w));
        const closestY = Math.max(f.y, Math.min(cy, f.y + f.h));
        const dx = cx - closestX, dy = cy - closestY;
        return dx * dx + dy * dy < r * r;
    }

    isInAnyLight(x, y) {
        for (const l of this.lamps) if (l.isInSafeZone(x, y)) return true;
        return false;
    }

    /* ---- 地面渲染（含路网） ---- */
    drawGround(ctx, cam, vw, vh) {
        const P = HC.palette;
        // 草地底
        ctx.fillStyle = P.grass;
        ctx.fillRect(0, 0, vw, vh);
        // 草地噪点格
        const tile = 80;
        const sx0 = Math.floor(cam.x / tile) * tile;
        const sy0 = Math.floor(cam.y / tile) * tile;
        for (let x = sx0; x < cam.x + vw + tile; x += tile) {
            for (let y = sy0; y < cam.y + vh + tile; y += tile) {
                if (((x / tile) + (y / tile)) % 2 === 0) {
                    ctx.fillStyle = P.grassAlt;
                    ctx.fillRect(x - cam.x, y - cam.y, tile, tile);
                }
            }
        }

        // 道路（含人行道与中线）
        this.roads.forEach(rd => {
            const rx = rd.x - cam.x, ry = rd.y - cam.y;
            if (rx > vw || ry > vh || rx + rd.w < 0 || ry + rd.h < 0) return;
            // 人行道
            ctx.fillStyle = P.sidewalk;
            ctx.fillRect(rx, ry, rd.w, rd.h);
            // 柏油
            const inset = 14;
            ctx.fillStyle = P.asphalt;
            if (rd.horizontal) ctx.fillRect(rx, ry + inset, rd.w, rd.h - inset * 2);
            else ctx.fillRect(rx + inset, ry, rd.w - inset * 2, rd.h);
            // 中线虚线
            ctx.strokeStyle = P.roadLine; ctx.lineWidth = 3; ctx.setLineDash([20, 22]);
            ctx.beginPath();
            if (rd.horizontal) { ctx.moveTo(rx, ry + rd.h / 2); ctx.lineTo(rx + rd.w, ry + rd.h / 2); }
            else { ctx.moveTo(rx + rd.w / 2, ry); ctx.lineTo(rx + rd.w / 2, ry + rd.h); }
            ctx.stroke(); ctx.setLineDash([]);
        });
    }
};
