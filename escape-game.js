const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapCtx = minimapCanvas.getContext('2d');

// 游戏配置
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;
const VIEWPORT_WIDTH = canvas.width;
const VIEWPORT_HEIGHT = canvas.height;

// 游戏状态
let gameState = {
    running: true,
    won: false,
    paused: false
};

// 相机
class Camera {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.smoothing = 0.1;
    }

    follow(target) {
        this.targetX = target.x - VIEWPORT_WIDTH / 2;
        this.targetY = target.y - VIEWPORT_HEIGHT / 2;

        // 限制相机范围
        this.targetX = Math.max(0, Math.min(WORLD_WIDTH - VIEWPORT_WIDTH, this.targetX));
        this.targetY = Math.max(0, Math.min(WORLD_HEIGHT - VIEWPORT_HEIGHT, this.targetY));
    }

    update() {
        this.x += (this.targetX - this.x) * this.smoothing;
        this.y += (this.targetY - this.y) * this.smoothing;
    }
}

// 加载精灵图
const catSprite = new Image();
catSprite.src = 'cat-sprite.png';
let spriteLoaded = false;
let spriteWidth = 0;
let spriteHeight = 0;

catSprite.onload = () => {
    spriteLoaded = true;
    // 调整切割参数，给每个精灵更多空间
    spriteWidth = Math.floor(catSprite.width / 3) + 10;  // 3列，增加一些宽度
    spriteHeight = Math.floor(catSprite.height / 3) + 10; // 3行，增加一些高度
    console.log('Cat sprite loaded:', catSprite.width, 'x', catSprite.height);
    console.log('Each sprite:', spriteWidth, 'x', spriteHeight);
};

// 加载路灯图片
const lampSprite = new Image();
lampSprite.src = 'lamp-new.png';  // 使用新的路灯图片
let lampLoaded = false;
lampSprite.onload = () => {
    lampLoaded = true;
    console.log('Lamp sprite loaded:', lampSprite.width, 'x', lampSprite.height);
};

// 加载狗精灵图
const dogSprite = new Image();
dogSprite.src = 'dogwalk.png';
let dogSpriteLoaded = false;
let dogSpriteWidth = 0;
let dogSpriteHeight = 0;

dogSprite.onload = () => {
    dogSpriteLoaded = true;
    // 狗精灵图是4x8的网格
    dogSpriteWidth = Math.floor(dogSprite.width / 4);
    dogSpriteHeight = Math.floor(dogSprite.height / 8);
    console.log('Dog sprite loaded:', dogSprite.width, 'x', dogSprite.height);
    console.log('Each dog sprite:', dogSpriteWidth, 'x', dogSpriteHeight);
};

// 加载裂纹石板纹理
const crackedStoneTexture = new Image();
crackedStoneTexture.src = 'cracked-stone-texture.png'; // 使用正确的纹理图片
let crackedStoneLoaded = false;

crackedStoneTexture.onload = () => {
    crackedStoneLoaded = true;
    console.log('Cracked stone texture loaded:', crackedStoneTexture.width, 'x', crackedStoneTexture.height);
};

// 如果纹理加载失败，尝试备用路径
crackedStoneTexture.onerror = () => {
    console.error('Failed to load cracked stone texture, trying backup...');
    crackedStoneTexture.src = 'cracked-stone.png';
};

// 猫咪角色
class Cat {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.targetX = null;
        this.targetY = null;
        this.vx = 0;
        this.vy = 0;

        // 速度曲线参数
        this.minSpeed = 0.5;      // 起步速度
        this.normalSpeed = 3;      // 正常最高速度
        this.runSpeed = 5;         // 奔跑最高速度
        this.currentMaxSpeed = this.normalSpeed;  // 当前最高速度（正常或奔跑）
        this.actualSpeed = 0;      // 实际当前速度
        this.acceleration = 0.1;   // 加速度
        this.deceleration = 0.15;  // 减速度（比加速快）

        this.health = 100;
        this.maxHealth = 100;
        this.size = 30;
        this.animationFrame = 0;
        this.facing = 'right';
        this.isRunning = false;
        this.stamina = 100;
        this.maxStamina = 100;
        this.invulnerable = false;
        this.invulnerableTime = 0;
        this.isMoving = false;     // 是否正在移动

        // 精灵图参数
        this.currentSprite = 4; // 当前使用的精灵索引（默认中间那个）
        this.animationSpeed = 0.15;
        this.animationTimer = 0;

        // 坐下相关
        this.idleTime = 0;        // 静止时间计数
        this.sitThreshold = 180;  // 3秒（60帧/秒）后坐下
        this.isSitting = false;   // 是否正在坐着
    }

    update(keys, lights = []) {
        // 键盘控制
        let dx = 0, dy = 0;

        if (keys.ArrowLeft || keys.KeyA) dx = -1;
        if (keys.ArrowRight || keys.KeyD) dx = 1;
        if (keys.ArrowUp || keys.KeyW) dy = -1;
        if (keys.ArrowDown || keys.KeyS) dy = 1;

        // 奔跑状态
        this.isRunning = keys.ShiftLeft && this.stamina > 0;

        // 设置目标最高速度（正常或奔跑）
        this.currentMaxSpeed = this.isRunning ? this.runSpeed : this.normalSpeed;

        // 体力消耗和恢复
        if (this.isRunning && (dx !== 0 || dy !== 0)) {
            this.stamina = Math.max(0, this.stamina - 0.5);
        } else if (!this.isRunning) {
            this.stamina = Math.min(this.maxStamina, this.stamina + 0.3);
        }

        // 鼠标控制
        if (this.targetX !== null && this.targetY !== null) {
            const mdx = this.targetX - this.x;
            const mdy = this.targetY - this.y;
            const dist = Math.sqrt(mdx * mdx + mdy * mdy);

            if (dist > 10) {  // 增加停止距离
                dx = mdx / dist;
                dy = mdy / dist;

                // 根据目标方向设置面向
                if (mdx > 0) this.facing = 'right';
                else if (mdx < 0) this.facing = 'left';
            } else {
                // 到达目标，清除目标并停止
                this.targetX = null;
                this.targetY = null;
                dx = 0;
                dy = 0;
            }
        }

        // 判断是否要移动
        this.isMoving = (dx !== 0 || dy !== 0);

        // 速度曲线处理
        if (this.isMoving) {
            // 加速
            if (this.actualSpeed < this.currentMaxSpeed) {
                this.actualSpeed += this.acceleration;
                // 从静止开始时，至少有最小速度
                if (this.actualSpeed < this.minSpeed) {
                    this.actualSpeed = this.minSpeed;
                }
                // 不超过最高速度
                if (this.actualSpeed > this.currentMaxSpeed) {
                    this.actualSpeed = this.currentMaxSpeed;
                }
            } else if (this.actualSpeed > this.currentMaxSpeed) {
                // 从奔跑切换到正常速度时的减速
                this.actualSpeed -= this.deceleration;
                if (this.actualSpeed < this.currentMaxSpeed) {
                    this.actualSpeed = this.currentMaxSpeed;
                }
            }

            // 归一化方向并应用实际速度
            const mag = Math.sqrt(dx * dx + dy * dy);
            this.vx = (dx / mag) * this.actualSpeed;
            this.vy = (dy / mag) * this.actualSpeed;

            // 键盘控制时更新面向
            if (!this.targetX && !this.targetY) {
                if (dx > 0) this.facing = 'right';
                else if (dx < 0) this.facing = 'left';
            }
        } else {
            // 减速
            this.actualSpeed -= this.deceleration;
            if (this.actualSpeed < 0) {
                this.actualSpeed = 0;
            }

            // 惯性减速
            this.vx *= 0.85;
            this.vy *= 0.85;

            // 当速度足够小时，完全停止
            if (Math.abs(this.vx) < 0.05) this.vx = 0;
            if (Math.abs(this.vy) < 0.05) this.vy = 0;
        }

        // 检查路灯碰撞
        let newX = this.x + this.vx;
        let newY = this.y + this.vy;
        let canMoveX = true;
        let canMoveY = true;

        // 检查每个路灯的碰撞
        let hitLamp = false;
        for (let light of lights) {
            // 路灯碰撞参数
            const collisionRadius = 15;  // 碰撞半径（稍微小一点）
            const collisionOffsetY = -40;  // 碰撞中心向上偏移（灯杆中部）

            // 碰撞中心点（在灯杆中部）
            const collisionX = light.x;
            const collisionY = light.y + collisionOffsetY;

            // 分别检查X和Y方向的移动
            // 检查X方向
            const dxNew = newX - collisionX;
            const dyOld = this.y - collisionY;
            if (Math.sqrt(dxNew * dxNew + dyOld * dyOld) < collisionRadius + this.size/2) {
                canMoveX = false;
                hitLamp = true;
            }

            // 检查Y方向
            const dxOld = this.x - collisionX;
            const dyNew = newY - collisionY;
            if (Math.sqrt(dxOld * dxOld + dyNew * dyNew) < collisionRadius + this.size/2) {
                canMoveY = false;
                hitLamp = true;
            }
        }

        // 如果碰到路灯，清除鼠标目标点，停止移动
        if (hitLamp && this.targetX !== null && this.targetY !== null) {
            this.targetX = null;
            this.targetY = null;
            this.vx = 0;
            this.vy = 0;
            this.actualSpeed = 0;
        }

        // 更新位置（只在可以移动的方向上更新）
        if (canMoveX) this.x = newX;
        if (canMoveY) this.y = newY;

        // 限制在世界边界内
        this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x));
        this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y));

        // 更新精灵动画
        const isMoving = Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1;

        // 调试：每60帧输出一次状态（已注释，需要时可打开）
        // if (Math.floor(this.animationFrame) % 60 === 0) {
        //     console.log('ActualSpeed:', this.actualSpeed.toFixed(2), 'Target:', this.currentMaxSpeed, 'Moving:', isMoving);
        // }

        if (isMoving) {
            // 只在移动时更新动画帧
            this.animationFrame += 0.2;
            this.animationTimer += this.animationSpeed;
            if (this.animationTimer >= 1) {
                this.animationTimer = 0;
                // 根据移动状态选择精灵帧，使用循环而不是随机
                if (this.isRunning) {
                    // 奔跑使用第二行的精灵 (3, 4, 5)
                    this.currentSprite = 3 + (Math.floor(this.animationFrame) % 3);
                } else {
                    // 正常移动使用第一行和第三行，循环播放
                    const frames = [0, 1, 2, 6, 7, 8];
                    const frameIndex = Math.floor(this.animationFrame / 2) % frames.length;
                    this.currentSprite = frames[frameIndex];
                }
            }
        } else {
            // 静止时的处理
            this.animationTimer = 0;
            this.animationFrame = 0;  // 重置动画帧

            // 增加静止时间
            this.idleTime++;

            // 检查是否应该坐下
            if (this.idleTime > this.sitThreshold && !this.isSitting) {
                this.isSitting = true;
                // 坐着的姿势在第一排中间 (索引1)
                this.currentSprite = 1;
            } else if (!this.isSitting) {
                // 站立姿势
                this.currentSprite = 4;
            }

            // 坐着时偶尔切换不同的坐姿（让猫咪看起来更生动）
            if (this.isSitting && Math.random() < 0.005) {
                // 只在真正的坐姿间切换
                const sitPoses = [0, 1];  // 只使用第一排左边和中间的坐姿
                this.currentSprite = sitPoses[Math.floor(Math.random() * sitPoses.length)];
            }
        }

        // 如果开始移动，重置坐下状态
        if (isMoving && this.isSitting) {
            this.isSitting = false;
            this.idleTime = 0;
        } else if (isMoving) {
            this.idleTime = 0;
        }

        // 更新无敌时间
        if (this.invulnerable) {
            this.invulnerableTime--;
            if (this.invulnerableTime <= 0) {
                this.invulnerable = false;
            }
        }
    }

    takeDamage(amount) {
        if (!this.invulnerable) {
            this.health = Math.max(0, this.health - amount);
            this.invulnerable = true;
            this.invulnerableTime = 60; // 1秒无敌时间
            return true;
        }
        return false;
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        ctx.save();
        ctx.translate(screenX, screenY);

        // 无敌闪烁效果
        if (this.invulnerable && Math.floor(this.invulnerableTime / 5) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // 影子
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 25, 25, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // 如果精灵图已加载，使用精灵图绘制
        if (spriteLoaded && spriteWidth > 0 && spriteHeight > 0) {
            // 计算精灵在图片中的位置（调整偏移避免切割）
            const col = this.currentSprite % 3;
            const row = Math.floor(this.currentSprite / 3);
            // 使用原始尺寸进行切割，避免重叠
            const actualSpriteW = (catSprite.width / 3);
            const actualSpriteH = (catSprite.height / 3);
            const sx = col * actualSpriteW - 10;  // 向左偏移10像素，确保猫脸完整
            const sy = row * actualSpriteH;

            // 调整绘制大小
            const drawWidth = 70;
            const drawHeight = 70;

            ctx.save();
            // 修正：向左时不翻转，向右时翻转（因为原始图片是朝左的）
            if (this.facing === 'right') {
                ctx.scale(-1, 1);
            }

            // 绘制精灵
            try {
                ctx.drawImage(
                    catSprite,
                    sx, sy, actualSpriteW, actualSpriteH,  // 使用精确的切割区域
                    -drawWidth/2, -drawHeight/2, drawWidth, drawHeight
                );
            } catch (e) {
                console.error('Error drawing sprite:', e);
                // 如果绘制失败，使用备用绘制
                ctx.fillStyle = '#000';
                ctx.fillRect(-drawWidth/2, -drawHeight/2, drawWidth, drawHeight);
            }

            ctx.restore();
        } else {
            // 备用绘制（精灵图未加载时）
            if (this.facing === 'left') {
                ctx.scale(-1, 1);
            }

            // 身体
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(0, 0, 25, 20, 0, 0, Math.PI * 2);
            ctx.fill();

            // 头
            ctx.beginPath();
            ctx.ellipse(15, -10, 18, 16, 0, 0, Math.PI * 2);
            ctx.fill();

            // 耳朵
            ctx.beginPath();
            ctx.moveTo(8, -20);
            ctx.lineTo(5, -30);
            ctx.lineTo(12, -26);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(22, -20);
            ctx.lineTo(19, -30);
            ctx.lineTo(26, -26);
            ctx.closePath();
            ctx.fill();

            // 眼睛（白色）
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(12, -10, 4, 0, Math.PI * 2);
            ctx.arc(18, -10, 4, 0, Math.PI * 2);
            ctx.fill();

            // 瞳孔
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(12, -10, 2, 0, Math.PI * 2);
            ctx.arc(18, -10, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

// 灯光安全区
class SafeLight {
    constructor(x, y, radius = 170) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.innerRadius = radius * 0.3;
        this.flickerOffset = Math.random() * Math.PI * 2;
        this.brightness = 1;
    }

    update() {
        // 灯光闪烁效果
        this.brightness = 0.9 + Math.sin(Date.now() / 200 + this.flickerOffset) * 0.1;
    }

    isInSafeZone(x, y) {
        const dx = x - this.x;
        const dy = y - this.y;
        return Math.sqrt(dx * dx + dy * dy) < this.radius;
    }

    // 绘制底层部分（光效和底座）
    drawBase(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // 移除过度的光效，只保留微弱的光晕提示
        // 这部分现在主要用于绘制底座，光照效果将在darkness层处理

        // 绘制路灯底座部分（如果图片已加载）
        if (lampLoaded) {
            const lampHeight = 200;  // 调整路灯尺寸
            const lampWidth = lampHeight * (lampSprite.width / lampSprite.height);
            const lampTopY = screenY - lampHeight + 20;

            // 只绘制底座部分（图片底部约33%的部分 - 包含完整石头底座）
            ctx.save();
            ctx.drawImage(
                lampSprite,
                0, lampSprite.height * 0.67,  // 源图片：从67%高度开始（包含完整石头底座）
                lampSprite.width, lampSprite.height * 0.33,  // 源图片：取33%高度
                screenX - lampWidth / 2,
                lampTopY + lampHeight * 0.67,  // 目标位置：对应底部33%
                lampWidth,
                lampHeight * 0.33  // 目标大小：33%高度
            );
            ctx.restore();
        }
    }

    // 绘制顶层部分（灯杆和灯头）
    drawPole(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // 如果路灯图片已加载，使用图片绘制
        if (lampLoaded) {
            // 绘制路灯图片
            const lampHeight = 200;  // 调整路灯尺寸
            const lampWidth = lampHeight * (lampSprite.width / lampSprite.height);
            const lampTopY = screenY - lampHeight + 20;

            // 先绘制灯泡位置的点光源光晕
            ctx.save();
            const bulbY = lampTopY + lampHeight * 0.17;  // 灯泡大约在顶部17%的位置

            // 绘制灯泡光晕 - 更小更柔和
            const bulbGradient = ctx.createRadialGradient(screenX, bulbY, 0, screenX, bulbY, 25);
            bulbGradient.addColorStop(0, `rgba(255, 255, 200, ${0.5 * this.brightness})`);
            bulbGradient.addColorStop(0.3, `rgba(255, 245, 150, ${0.3 * this.brightness})`);
            bulbGradient.addColorStop(0.6, `rgba(255, 240, 120, ${0.2 * this.brightness})`);
            bulbGradient.addColorStop(1, 'rgba(255, 235, 100, 0)');

            ctx.fillStyle = bulbGradient;
            ctx.beginPath();
            ctx.arc(screenX, bulbY, 25, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // 只绘制灯杆和灯头部分（图片顶部约75%的部分 - 不包括石头底座）
            ctx.save();
            // 灯泡发光效果 - 在灯的顶部添加光晕
            ctx.shadowColor = `rgba(255, 250, 180, ${this.brightness})`;
            ctx.shadowBlur = 50;
            ctx.shadowOffsetY = -10;

            ctx.drawImage(
                lampSprite,
                0, 0,  // 源图片：从顶部开始
                lampSprite.width, lampSprite.height * 0.67,  // 源图片：取67%高度（不包括石头底座）
                screenX - lampWidth / 2,
                lampTopY,  // 目标位置：正常位置
                lampWidth,
                lampHeight * 0.67  // 目标大小：67%高度
            );
            ctx.restore();
        } else {
            // 备用绘制（图片未加载时）
            this.drawBackupLamp(ctx, screenX, screenY);
        }
    }

    // 备用灯具绘制
    drawBackupLamp(ctx, screenX, screenY) {
        // 灯杆
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY + 20);
        ctx.lineTo(screenX, screenY - 60);
        ctx.stroke();

        // 灯泡
        ctx.fillStyle = `rgba(255, 240, 200, ${this.brightness})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY - 60, 15, 0, Math.PI * 2);
        ctx.fill();

        // 灯泡光晕
        ctx.fillStyle = `rgba(255, 255, 200, ${0.3 * this.brightness})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY - 60, 25, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 可控制的狗
class PlayerDog {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.targetX = null;
        this.targetY = null;
        this.vx = 0;
        this.vy = 0;

        // 速度参数（比猫更快）
        this.minSpeed = 1;
        this.normalSpeed = 4;
        this.runSpeed = 7;
        this.currentMaxSpeed = this.normalSpeed;
        this.actualSpeed = 0;
        this.acceleration = 0.15;
        this.deceleration = 0.2;

        this.health = 150; // 狗血更厚
        this.maxHealth = 150;
        this.size = 40;
        this.animationFrame = 0;
        this.facing = 'right';
        this.isRunning = false;
        this.isMoving = false;
        this.currentSprite = 0;
    }

    update(keys) {
        // 键盘控制（和猫一样）
        let dx = 0, dy = 0;

        if (keys.ArrowLeft || keys.KeyA) dx = -1;
        if (keys.ArrowRight || keys.KeyD) dx = 1;
        if (keys.ArrowUp || keys.KeyW) dy = -1;
        if (keys.ArrowDown || keys.KeyS) dy = 1;

        // Shift 奔跑
        this.isRunning = keys.ShiftLeft || keys.ShiftRight;
        this.currentMaxSpeed = this.isRunning ? this.runSpeed : this.normalSpeed;

        // 鼠标目标控制
        if (this.targetX !== null && this.targetY !== null) {
            const distX = this.targetX - this.x;
            const distY = this.targetY - this.y;
            const distance = Math.sqrt(distX * distX + distY * distY);

            if (distance > 10) {
                dx = distX / distance;
                dy = distY / distance;
            } else {
                this.targetX = null;
                this.targetY = null;
            }
        }

        // 速度控制
        if (dx !== 0 || dy !== 0) {
            if (this.actualSpeed < this.currentMaxSpeed) {
                this.actualSpeed = Math.min(this.actualSpeed + this.acceleration, this.currentMaxSpeed);
            } else if (this.actualSpeed > this.currentMaxSpeed) {
                this.actualSpeed = Math.max(this.actualSpeed - this.deceleration, this.currentMaxSpeed);
            }

            const length = Math.sqrt(dx * dx + dy * dy);
            this.vx = (dx / length) * this.actualSpeed;
            this.vy = (dy / length) * this.actualSpeed;
            this.isMoving = true;
        } else {
            if (this.actualSpeed > 0) {
                this.actualSpeed = Math.max(this.actualSpeed - this.deceleration, 0);
            }

            if (this.actualSpeed > 0) {
                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (speed > 0) {
                    this.vx = (this.vx / speed) * this.actualSpeed;
                    this.vy = (this.vy / speed) * this.actualSpeed;
                }
            } else {
                this.vx = 0;
                this.vy = 0;
                this.isMoving = false;
            }
        }

        // 更新位置
        this.x += this.vx;
        this.y += this.vy;

        // 边界限制
        this.x = Math.max(50, Math.min(WORLD_WIDTH - 50, this.x));
        this.y = Math.max(50, Math.min(WORLD_HEIGHT - 50, this.y));
    }

    setMouseTarget(worldX, worldY) {
        this.targetX = worldX;
        this.targetY = worldY;
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            return true;
        }
        return false;
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        ctx.save();
        ctx.translate(screenX, screenY);

        // 影子
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 25, 35, 15, 0, 0, Math.PI * 2);
        ctx.fill();

        // 如果狗精灵图已加载，使用精灵图绘制
        if (dogSpriteLoaded) {
            // 更新面向方向
            if (this.vx > 0.1) {
                this.facing = 'right';
            } else if (this.vx < -0.1) {
                this.facing = 'left';
            }

            // 更新动画帧（和野狗使用相同的关键帧）
            const isMoving = Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1;
            if (isMoving) {
                this.animationFrame += 0.1;
                // 使用相同的关键帧序列
                const keyFrames = [0, 5, 10, 14, 11, 15, 10, 6];
                const frameIndex = Math.floor(this.animationFrame) % keyFrames.length;
                this.currentSprite = keyFrames[frameIndex];
            } else {
                this.currentSprite = 0;
                this.animationFrame = 0;
            }

            // 计算精灵图中的位置
            const sx = (this.currentSprite % 4) * dogSpriteWidth;
            const sy = Math.floor(this.currentSprite / 4) * dogSpriteHeight;

            // 根据面向方向翻转
            if (this.facing === 'right') {
                ctx.scale(-1, 1);
            }

            // 设置图像渲染质量
            ctx.imageSmoothingEnabled = false;

            // 保持原始宽高比的缩放（玩家控制的狗稍大）
            const scale = 0.6;
            const drawWidth = dogSpriteWidth * scale;
            const drawHeight = dogSpriteHeight * scale;

            ctx.drawImage(
                dogSprite,
                sx, sy,
                dogSpriteWidth, dogSpriteHeight,
                -drawWidth / 2, -drawHeight / 2 - 10,
                drawWidth, drawHeight
            );
        } else {
            // 备用绘制
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(-25, -25, 50, 40);
        }

        ctx.restore();
    }
}

// 野狗
class WildDog {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.speed = 1.5;        // 巡逻速度
        this.minChaseSpeed = 2.0;  // 追击起始速度
        this.maxChaseSpeed = 3.3;  // 最高追击速度（猫咪速度的1.1倍）
        this.currentChaseSpeed = this.minChaseSpeed; // 当前追击速度
        this.acceleration = 0.008;  // 加速度（降低到之前的40%）
        this.size = 25;
        this.detectionRadius = 200;
        this.territoryRadius = 300;
        this.homeX = x;
        this.homeY = y;
        this.state = 'patrol'; // patrol, chase, return
        this.patrolAngle = Math.random() * Math.PI * 2;
        this.animationFrame = 0;
        this.attackCooldown = 0;
        this.growlSound = false;
        this.facing = 'left';  // 狗面向的方向
        this.currentSprite = 0; // 当前精灵帧
    }

    update(cat, lights) {
        // 检查猫是否在安全区
        let catInSafeZone = false;
        for (let light of lights) {
            if (light.isInSafeZone(cat.x, cat.y)) {
                catInSafeZone = true;
                break;
            }
        }

        const dx = cat.x - this.x;
        const dy = cat.y - this.y;
        const distanceToCat = Math.sqrt(dx * dx + dy * dy);

        const dhx = this.homeX - this.x;
        const dhy = this.homeY - this.y;
        const distanceToHome = Math.sqrt(dhx * dhx + dhy * dhy);

        // 状态机
        switch (this.state) {
            case 'patrol':
                // 巡逻模式 - 从点到点移动

                // 初始化或选择新的目标点
                if (!this.targetPoint || this.needNewTarget) {
                    // 在领地范围内随机选择一个目标点
                    const angle = Math.random() * Math.PI * 2;

                    // 随机选择近距离或远距离目标
                    let distance;
                    if (Math.random() < 0.6) {
                        // 60%概率选择近距离（小范围活动）
                        distance = Math.random() * this.territoryRadius * 0.3;
                    } else {
                        // 40%概率选择远距离（大范围巡逻）
                        distance = this.territoryRadius * 0.3 + Math.random() * this.territoryRadius * 0.4;
                    }

                    this.targetPoint = {
                        x: this.homeX + Math.cos(angle) * distance,
                        y: this.homeY + Math.sin(angle) * distance
                    };
                    this.needNewTarget = false;
                    this.restTimer = 0;
                }

                // 计算到目标点的距离
                const targetDx = this.targetPoint.x - this.x;
                const targetDy = this.targetPoint.y - this.y;
                const targetDistance = Math.sqrt(targetDx * targetDx + targetDy * targetDy);

                // 如果还没到达目标点
                if (targetDistance > 20) {
                    // 向目标点移动
                    this.vx = (targetDx / targetDistance) * this.speed * 0.5;
                    this.vy = (targetDy / targetDistance) * this.speed * 0.5;
                    this.restTimer = 0;
                } else {
                    // 到达目标点，休息一会
                    this.vx = 0;
                    this.vy = 0;

                    if (!this.restTimer) {
                        this.restTimer = 0;
                        this.restDuration = 120 + Math.random() * 180; // 休息2-5秒
                    }

                    this.restTimer++;

                    // 休息结束后选择新目标
                    if (this.restTimer > this.restDuration) {
                        this.needNewTarget = true;
                    }
                }

                // 保持在领地范围内
                if (distanceToHome > this.territoryRadius * 0.8) {
                    // 回家作为下一个目标点
                    this.targetPoint = {
                        x: this.homeX,
                        y: this.homeY
                    };
                }

                // 检测到猫且猫不在安全区
                if (distanceToCat < this.detectionRadius && !catInSafeZone) {
                    this.state = 'chase';
                    this.growlSound = true;
                    // 重置追击速度为起始速度
                    this.currentChaseSpeed = this.minChaseSpeed;
                }
                break;

            case 'chase':
                // 追击模式 - 逐渐加速
                if (distanceToCat > 5 && !catInSafeZone) {
                    // 加速到最高速度
                    if (this.currentChaseSpeed < this.maxChaseSpeed) {
                        this.currentChaseSpeed += this.acceleration;
                        if (this.currentChaseSpeed > this.maxChaseSpeed) {
                            this.currentChaseSpeed = this.maxChaseSpeed;
                        }
                    }

                    this.vx = (dx / distanceToCat) * this.currentChaseSpeed;
                    this.vy = (dy / distanceToCat) * this.currentChaseSpeed;

                    // 攻击
                    if (distanceToCat < 40 && this.attackCooldown <= 0) {
                        if (cat.takeDamage(20)) {
                            this.attackCooldown = 60;
                        }
                    }
                } else {
                    this.vx *= 0.9;
                    this.vy *= 0.9;
                }

                // 离开领地太远或猫进入安全区
                if (distanceToHome > this.territoryRadius || catInSafeZone || distanceToCat > this.detectionRadius * 1.5) {
                    this.state = 'return';
                }
                break;

            case 'return':
                // 返回领地
                if (distanceToHome > 10) {
                    this.vx = (dhx / distanceToHome) * this.speed;
                    this.vy = (dhy / distanceToHome) * this.speed;
                } else {
                    this.state = 'patrol';
                    // 重置追击速度
                    this.currentChaseSpeed = this.minChaseSpeed;
                }
                break;
        }

        // 更新位置
        this.x += this.vx;
        this.y += this.vy;

        // 边界限制
        this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x));
        this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y));

        // 更新冷却
        if (this.attackCooldown > 0) this.attackCooldown--;
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        ctx.save();
        ctx.translate(screenX, screenY);

        // 影子
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 20, 30, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // 如果狗精灵图已加载，使用精灵图绘制
        if (dogSpriteLoaded) {
            // 更新面向方向
            if (this.vx > 0.1) {
                this.facing = 'right';
            } else if (this.vx < -0.1) {
                this.facing = 'left';
            }

            // 更新动画帧
            const isMoving = Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1;
            if (isMoving) {
                this.animationFrame += 0.1;  // 调整动画速度
                // 只使用动作幅度大的关键帧
                const keyFrames = [0, 5, 10, 14, 11, 15, 10, 6]; // 选择动作明显的帧
                const frameIndex = Math.floor(this.animationFrame) % keyFrames.length;
                this.currentSprite = keyFrames[frameIndex];
            } else {
                // 静止时使用第一帧作为站立动画
                this.currentSprite = 0;
                this.animationFrame = 0;
            }

            // 计算精灵图中的位置（4列x8行）
            const sx = (this.currentSprite % 4) * dogSpriteWidth;
            const sy = Math.floor(this.currentSprite / 4) * dogSpriteHeight;

            // 根据面向方向翻转
            if (this.facing === 'right') {
                ctx.scale(-1, 1);  // 水平翻转
            }

            // 设置图像渲染质量
            ctx.imageSmoothingEnabled = false; // 关闭抗锯齿，保持像素风格清晰

            // 保持原始宽高比的缩放
            const scale = 0.5; // 缩放倍数
            const drawWidth = dogSpriteWidth * scale;
            const drawHeight = dogSpriteHeight * scale;

            ctx.drawImage(
                dogSprite,
                sx, sy,
                dogSpriteWidth, dogSpriteHeight,
                -drawWidth / 2, -drawHeight / 2 - 10,  // 稍微上移
                drawWidth, drawHeight
            );

            // 如果在追击状态，添加红眼效果
            if (this.state === 'chase') {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                ctx.beginPath();
                // 根据面向调整眼睛位置
                const eyeX = this.facing === 'right' ? -10 : 10;
                ctx.arc(eyeX - 5, -15, 3, 0, Math.PI * 2);
                ctx.arc(eyeX + 5, -15, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            // 备用绘制（精灵图未加载时）
            const bodyColor = this.state === 'chase' ? '#8B0000' : '#654321';
            ctx.fillStyle = bodyColor;
            ctx.beginPath();
            ctx.ellipse(0, 0, 30, 20, 0, 0, Math.PI * 2);
            ctx.fill();

            // 头
            ctx.beginPath();
            ctx.ellipse(20, -5, 20, 18, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        // 显示检测范围（调试用，可以注释掉）
        if (this.state === 'chase') {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.detectionRadius, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

// 出口
class Exit {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 60;
        this.animationFrame = 0;
    }

    update() {
        this.animationFrame += 0.05;
    }

    checkReached(cat) {
        const dx = cat.x - this.x;
        const dy = cat.y - this.y;
        return Math.sqrt(dx * dx + dy * dy) < this.size;
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // 发光效果
        const glowSize = this.size + Math.sin(this.animationFrame) * 10;
        const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, glowSize);
        gradient.addColorStop(0, 'rgba(100, 255, 100, 0.8)');
        gradient.addColorStop(1, 'rgba(100, 255, 100, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, glowSize, 0, Math.PI * 2);
        ctx.fill();

        // 出口标志
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(screenX - 30, screenY - 40, 60, 80);

        // 门框
        ctx.strokeStyle = '#27ae60';
        ctx.lineWidth = 5;
        ctx.strokeRect(screenX - 30, screenY - 40, 60, 80);

        // EXIT 文字
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('EXIT', screenX, screenY);

        // 箭头
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX - 10, screenY - 20);
        ctx.lineTo(screenX, screenY - 30);
        ctx.lineTo(screenX + 10, screenY - 20);
        ctx.stroke();
    }
}

// 游戏世界
class GameWorld {
    constructor() {
        this.camera = new Camera();
        this.cat = new Cat(200, 200);
        this.lights = [];
        this.dogs = [];
        this.exit = null;
        this.particles = [];
        this.obstacles = [];

        this.keys = {};
        this.mouseTarget = null;

        // 角色控制模式
        this.controlMode = 'cat'; // 'cat' 或 'dog'
        this.playerDog = null; // 当切换到狗模式时创建

        // 关卡系统
        this.currentLevel = 1; // 默认关卡1
        this.levelMenu = document.getElementById('levelMenu');

        // 小地图显示状态
        this.minimapVisible = false;
        this.minimapElement = document.querySelector('.minimap');

        this.init();
    }

    init() {
        // 生成灯光
        for (let i = 0; i < 12; i++) {
            const x = Math.random() * (WORLD_WIDTH - 400) + 200;
            const y = Math.random() * (WORLD_HEIGHT - 400) + 200;
            this.lights.push(new SafeLight(x, y));
        }

        // 生成野狗
        for (let i = 0; i < 15; i++) {
            const x = Math.random() * (WORLD_WIDTH - 400) + 200;
            const y = Math.random() * (WORLD_HEIGHT - 400) + 200;

            // 确保野狗不在灯光范围内生成
            let validPosition = true;
            for (let light of this.lights) {
                if (light.isInSafeZone(x, y)) {
                    validPosition = false;
                    break;
                }
            }

            if (validPosition) {
                this.dogs.push(new WildDog(x, y));
            } else {
                i--; // 重新生成
            }
        }

        // 生成出口（在地图边缘）
        const side = Math.floor(Math.random() * 4);
        let exitX, exitY;
        switch (side) {
            case 0: exitX = WORLD_WIDTH - 100; exitY = Math.random() * WORLD_HEIGHT; break;
            case 1: exitX = 100; exitY = Math.random() * WORLD_HEIGHT; break;
            case 2: exitX = Math.random() * WORLD_WIDTH; exitY = WORLD_HEIGHT - 100; break;
            case 3: exitX = Math.random() * WORLD_WIDTH; exitY = 100; break;
        }
        this.exit = new Exit(exitX, exitY);

        // 生成装饰性障碍物（石头、树等）
        for (let i = 0; i < 30; i++) {
            this.obstacles.push({
                x: Math.random() * WORLD_WIDTH,
                y: Math.random() * WORLD_HEIGHT,
                size: Math.random() * 30 + 20,
                type: Math.random() > 0.5 ? 'rock' : 'tree'
            });
        }
    }

    update() {
        if (!gameState.running) return;

        // 根据控制模式更新角色
        let controlledEntity;
        if (this.controlMode === 'cat') {
            this.cat.update(this.keys, this.lights);
            controlledEntity = this.cat;
        } else if (this.controlMode === 'dog' && this.playerDog) {
            this.playerDog.update(this.keys);
            controlledEntity = this.playerDog;
        } else {
            controlledEntity = this.cat;
        }

        // 相机跟随当前控制的角色
        this.camera.follow(controlledEntity);
        this.camera.update();

        // 更新灯光
        this.lights.forEach(light => light.update());

        // 更新野狗
        this.dogs.forEach(dog => dog.update(this.cat, this.lights));

        // 更新出口
        this.exit.update();

        // 检查是否到达出口
        if (this.exit.checkReached(this.cat)) {
            this.win();
        }

        // 检查游戏失败
        if (this.cat.health <= 0) {
            this.gameOver();
        }

        // 更新UI
        this.updateUI();
    }

    draw() {
        // 清空画布
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

        // 绘制地面纹理
        this.drawGround();

        // 绘制障碍物
        this.drawObstacles();

        // 绘制灯光底层（光效）
        this.lights.forEach(light => light.drawBase(ctx, this.camera));

        // 收集所有需要按Y轴排序的对象
        const renderables = [];

        // 添加路灯的灯杆部分
        this.lights.forEach(light => {
            renderables.push({
                y: light.y,  // 使用路灯的Y坐标进行排序
                type: 'lamp',
                obj: light,
                draw: () => light.drawPole(ctx, this.camera)
            });
        });

        // 添加野狗
        this.dogs.forEach(dog => {
            renderables.push({
                y: dog.y,
                type: 'dog',
                obj: dog,
                draw: () => dog.draw(ctx, this.camera)
            });
        });

        // 添加猫
        renderables.push({
            y: this.cat.y,
            type: 'cat',
            obj: this.cat,
            draw: () => this.cat.draw(ctx, this.camera)
        });

        // 添加玩家控制的狗（如果存在）
        if (this.playerDog) {
            renderables.push({
                y: this.playerDog.y,
                type: 'playerDog',
                obj: this.playerDog,
                draw: () => this.playerDog.draw(ctx, this.camera)
            });
        }

        // 添加出口
        renderables.push({
            y: this.exit.y,
            type: 'exit',
            obj: this.exit,
            draw: () => this.exit.draw(ctx, this.camera)
        });

        // 按Y坐标排序（Y越小越先绘制，在画面后方）
        renderables.sort((a, b) => a.y - b.y);

        // 按顺序绘制
        renderables.forEach(item => item.draw());

        // 绘制小地图
        this.drawMinimap();

        // 绘制夜晚黑暗遮罩和光照效果
        this.drawDarknessWithLights();

        // 绘制暗角效果
        this.drawVignette();
    }

    drawGround() {
        switch (this.currentLevel) {
            case 1:
                this.drawGroundLevel1();
                break;
            case 2:
                this.drawGroundLevel2();
                break;
            case 3:
                this.drawGroundLevel3();
                break;
            case 4:
                this.drawGroundLevel4();
                break;
            case 5:
                this.drawGroundLevel5();
                break;
            default:
                this.drawGroundLevel1();
        }
    }

    drawGroundLevel1() {
        // 关卡1：经典黑暗街道，棋盘格地面
        const tileSize = 100;
        const startX = Math.floor(this.camera.x / tileSize) * tileSize;
        const startY = Math.floor(this.camera.y / tileSize) * tileSize;

        for (let x = startX; x < startX + VIEWPORT_WIDTH + tileSize; x += tileSize) {
            for (let y = startY; y < startY + VIEWPORT_HEIGHT + tileSize; y += tileSize) {
                const screenX = x - this.camera.x;
                const screenY = y - this.camera.y;

                // 棋盘格图案 - 更暗的夜晚色调
                const isDark = ((x / tileSize) + (y / tileSize)) % 2 === 0;
                ctx.fillStyle = isDark ? '#080808' : '#0f0f0f';  // 更暗的基础色
                ctx.fillRect(screenX, screenY, tileSize, tileSize);
            }
        }
    }

    drawGroundLevel2() {
        // 关卡2：公园风格，草地和石板路
        const tileSize = 50;
        const startX = Math.floor(this.camera.x / tileSize) * tileSize;
        const startY = Math.floor(this.camera.y / tileSize) * tileSize;

        for (let x = startX; x < startX + VIEWPORT_WIDTH + tileSize; x += tileSize) {
            for (let y = startY; y < startY + VIEWPORT_HEIGHT + tileSize; y += tileSize) {
                const screenX = x - this.camera.x;
                const screenY = y - this.camera.y;

                // 判断是否是路径
                const tileX = Math.floor(x / tileSize);
                const tileY = Math.floor(y / tileSize);
                const isPath = (tileX % 10 === 0 || tileY % 10 === 0) ||
                               ((tileX % 7 === 3) && (tileY % 7 === 3));

                if (isPath) {
                    // 石板路
                    ctx.fillStyle = '#8b8680';
                    ctx.fillRect(screenX, screenY, tileSize, tileSize);

                    // 石板接缝
                    ctx.strokeStyle = '#7a756f';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(screenX, screenY, tileSize, tileSize);
                } else {
                    // 草地底色
                    const grassShade = Math.random() < 0.5 ? '#2d5016' : '#3a5f1f';
                    ctx.fillStyle = grassShade;
                    ctx.fillRect(screenX, screenY, tileSize, tileSize);

                    // 添加草地纹理
                    ctx.save();
                    ctx.translate(screenX, screenY);

                    // 绘制几根草
                    ctx.strokeStyle = '#4a7c28';
                    ctx.lineWidth = 1;
                    for (let i = 0; i < 3; i++) {
                        const grassX = Math.random() * tileSize;
                        const grassY = Math.random() * tileSize;
                        ctx.beginPath();
                        ctx.moveTo(grassX, grassY);
                        ctx.lineTo(grassX - 2, grassY - 5);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(grassX, grassY);
                        ctx.lineTo(grassX + 2, grassY - 4);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
            }
        }
    }

    drawGroundLevel3() {
        // 关卡3：城市街区，柏油路和人行道
        const tileSize = 80;
        const startX = Math.floor(this.camera.x / tileSize) * tileSize;
        const startY = Math.floor(this.camera.y / tileSize) * tileSize;

        for (let x = startX; x < startX + VIEWPORT_WIDTH + tileSize; x += tileSize) {
            for (let y = startY; y < startY + VIEWPORT_HEIGHT + tileSize; y += tileSize) {
                const screenX = x - this.camera.x;
                const screenY = y - this.camera.y;

                const tileX = Math.floor(x / tileSize);
                const tileY = Math.floor(y / tileSize);

                // 判断是主路还是人行道
                const isMainRoad = (tileX % 8 < 5) && (tileY % 8 < 5);

                if (isMainRoad) {
                    // 柏油路
                    ctx.fillStyle = '#2c3e50';
                    ctx.fillRect(screenX, screenY, tileSize, tileSize);

                    // 添加路面纹理
                    if (Math.random() < 0.1) {
                        ctx.fillStyle = '#34495e';
                        ctx.fillRect(screenX + Math.random() * tileSize,
                                     screenY + Math.random() * tileSize, 5, 5);
                    }

                    // 路面标线
                    if (tileX % 4 === 2 && tileY % 2 === 0) {
                        ctx.fillStyle = '#f39c12';
                        ctx.fillRect(screenX + tileSize/2 - 2, screenY, 4, tileSize/2);
                    }
                } else {
                    // 人行道
                    ctx.fillStyle = '#95a5a6';
                    ctx.fillRect(screenX, screenY, tileSize, tileSize);

                    // 人行道砖块效果
                    ctx.strokeStyle = '#7f8c8d';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(screenX, screenY, tileSize/2, tileSize/2);
                    ctx.strokeRect(screenX + tileSize/2, screenY, tileSize/2, tileSize/2);
                    ctx.strokeRect(screenX, screenY + tileSize/2, tileSize/2, tileSize/2);
                    ctx.strokeRect(screenX + tileSize/2, screenY + tileSize/2, tileSize/2, tileSize/2);
                }
            }
        }
    }

    drawGroundLevel4() {
        // 关卡4：混合地形
        const tileSize = 60;
        const startX = Math.floor(this.camera.x / tileSize) * tileSize;
        const startY = Math.floor(this.camera.y / tileSize) * tileSize;

        for (let x = startX; x < startX + VIEWPORT_WIDTH + tileSize; x += tileSize) {
            for (let y = startY; y < startY + VIEWPORT_HEIGHT + tileSize; y += tileSize) {
                const screenX = x - this.camera.x;
                const screenY = y - this.camera.y;

                const tileX = Math.floor(x / tileSize);
                const tileY = Math.floor(y / tileSize);

                // 使用噪声函数决定地形类型
                const zone = (tileX * 7 + tileY * 13) % 4;

                switch (zone) {
                    case 0:
                        // 草地
                        ctx.fillStyle = '#3a5f1f';
                        ctx.fillRect(screenX, screenY, tileSize, tileSize);
                        break;
                    case 1:
                        // 石板
                        ctx.fillStyle = '#8b8680';
                        ctx.fillRect(screenX, screenY, tileSize, tileSize);
                        ctx.strokeStyle = '#7a756f';
                        ctx.strokeRect(screenX, screenY, tileSize, tileSize);
                        break;
                    case 2:
                        // 泥土
                        ctx.fillStyle = '#6b4226';
                        ctx.fillRect(screenX, screenY, tileSize, tileSize);
                        if (Math.random() < 0.2) {
                            ctx.fillStyle = '#5a3820';
                            ctx.fillRect(screenX + Math.random() * tileSize,
                                       screenY + Math.random() * tileSize, 3, 3);
                        }
                        break;
                    case 3:
                        // 沙地
                        ctx.fillStyle = '#c2b280';
                        ctx.fillRect(screenX, screenY, tileSize, tileSize);
                        // 沙粒效果
                        for (let i = 0; i < 3; i++) {
                            ctx.fillStyle = '#d4c4a0';
                            ctx.fillRect(screenX + Math.random() * tileSize,
                                       screenY + Math.random() * tileSize, 1, 1);
                        }
                        break;
                }
            }
        }
    }

    drawGroundLevel5() {
        // 关卡5：废墟遗迹 - 使用真实的裂纹石板纹理图片
        if (!crackedStoneLoaded) {
            // 如果纹理还未加载，使用备用颜色
            ctx.fillStyle = '#3a3d45';
            ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
            return;
        }

        // 获取纹理图片的一个瓦片大小（假设图片是2x2的瓦片）
        const textureWidth = crackedStoneTexture.width;
        const textureHeight = crackedStoneTexture.height;
        const tileWidth = textureWidth / 2;  // 图片包含2x2个瓦片
        const tileHeight = textureHeight / 2;

        // 游戏中每个瓦片的显示大小
        const displayTileSize = 85; // 缩小一倍

        const startX = Math.floor(this.camera.x / displayTileSize) * displayTileSize;
        const startY = Math.floor(this.camera.y / displayTileSize) * displayTileSize;

        // 创建一个模式来平铺纹理
        for (let x = startX; x < startX + VIEWPORT_WIDTH + displayTileSize; x += displayTileSize) {
            for (let y = startY; y < startY + VIEWPORT_HEIGHT + displayTileSize; y += displayTileSize) {
                const screenX = x - this.camera.x;
                const screenY = y - this.camera.y;

                // 使用瓦片坐标来决定使用纹理的哪个部分
                const tileX = Math.floor(x / displayTileSize);
                const tileY = Math.floor(y / displayTileSize);

                // 使用固定的哈希函数来确保同一位置总是使用相同的瓦片
                // 创造更多变化：使用所有4个瓦片
                const tileIndex = Math.abs(tileX * 7 + tileY * 11 + tileX * tileY * 3) % 4;
                const textureIndexX = tileIndex % 2;
                const textureIndexY = Math.floor(tileIndex / 2);

                // 从纹理图片中切出对应的瓦片
                ctx.drawImage(
                    crackedStoneTexture,
                    textureIndexX * tileWidth,  // 源图片的x位置
                    textureIndexY * tileHeight, // 源图片的y位置
                    tileWidth,                  // 源图片的宽度
                    tileHeight,                 // 源图片的高度
                    screenX,                    // 目标画布的x位置
                    screenY,                    // 目标画布的y位置
                    displayTileSize,            // 目标画布的宽度
                    displayTileSize             // 目标画布的高度
                );

                // 添加轻微的边缘暗化效果，增强瓦片之间的区分
                ctx.save();
                ctx.globalAlpha = 0.1;
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                ctx.strokeRect(screenX, screenY, displayTileSize, displayTileSize);
                ctx.restore();
            }
        }
    }

    drawObstacles() {
        this.obstacles.forEach(obs => {
            const screenX = obs.x - this.camera.x;
            const screenY = obs.y - this.camera.y;

            if (screenX > -100 && screenX < VIEWPORT_WIDTH + 100 &&
                screenY > -100 && screenY < VIEWPORT_HEIGHT + 100) {

                if (obs.type === 'rock') {
                    // 石头
                    ctx.fillStyle = '#555';
                    ctx.beginPath();
                    ctx.ellipse(screenX, screenY, obs.size, obs.size * 0.7, 0, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    // 树
                    ctx.fillStyle = '#2d4a2b';
                    ctx.beginPath();
                    ctx.moveTo(screenX, screenY - obs.size);
                    ctx.lineTo(screenX - obs.size * 0.7, screenY + obs.size * 0.5);
                    ctx.lineTo(screenX + obs.size * 0.7, screenY + obs.size * 0.5);
                    ctx.closePath();
                    ctx.fill();
                }
            }
        });
    }

    drawDarknessWithLights() {
        // 创建离屏canvas用于处理光照遮罩
        const offCanvas = document.createElement('canvas');
        offCanvas.width = VIEWPORT_WIDTH;
        offCanvas.height = VIEWPORT_HEIGHT;
        const offCtx = offCanvas.getContext('2d');

        // 1. 首先填充完全黑暗的遮罩 - 纯黑色
        offCtx.fillStyle = 'rgba(0, 0, 0, 0.65)';  // 纯黑色，65%不透明度，让暗区更亮一些
        offCtx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

        // 2. 在灯光位置"挖洞" - 优化擦除曲线
        offCtx.globalCompositeOperation = 'destination-out';

        this.lights.forEach(light => {
            const screenX = light.x - this.camera.x;
            const screenY = light.y - this.camera.y;

            // 创建硬边缘光圈 - 完全模仿参考游戏
            const lightGradient = offCtx.createRadialGradient(
                screenX, screenY - 20, 0,  // 修正：光源在灯杆顶部
                screenX, screenY - 20, light.radius  // 标准光照范围
            );

            // 硬边缘效果，外围自然过渡
            lightGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');      // 中心100%清晰
            lightGradient.addColorStop(0.7, 'rgba(255, 255, 255, 1)');    // 70%范围内完全清晰
            lightGradient.addColorStop(0.75, 'rgba(255, 255, 255, 0.85)'); // 开始衰减
            lightGradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.65)');  // 逐渐变暗
            lightGradient.addColorStop(0.85, 'rgba(255, 255, 255, 0.4)');  // 继续变暗
            lightGradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.2)');   // 较暗
            lightGradient.addColorStop(0.95, 'rgba(255, 255, 255, 0.08)'); // 很暗
            lightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');      // 完全黑暗

            offCtx.fillStyle = lightGradient;
            offCtx.beginPath();
            offCtx.arc(screenX, screenY - 20, light.radius, 0, Math.PI * 2);  // 修正：光圈中心在灯杆顶部
            offCtx.fill();
        });

        // 3. 将处理好的遮罩绘制到主画布
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(offCanvas, 0, 0);
        ctx.restore();

        // 4. 移除灯泡光晕效果（暂时注释掉）
        // ctx.save();
        // ctx.globalCompositeOperation = 'screen';

        // this.lights.forEach(light => {
        //     const screenX = light.x - this.camera.x;
        //     const screenY = light.y - this.camera.y;

        //     // 只有灯泡位置的小光晕
        //     const bulbGlow = ctx.createRadialGradient(
        //         screenX, screenY - 20, 0,
        //         screenX, screenY - 20, 15
        //     );
        //     bulbGlow.addColorStop(0, `rgba(255, 255, 200, ${0.3 * light.brightness})`);
        //     bulbGlow.addColorStop(0.5, `rgba(255, 250, 180, ${0.15 * light.brightness})`);
        //     bulbGlow.addColorStop(1, 'rgba(255, 245, 160, 0)');

        //     ctx.fillStyle = bulbGlow;
        //     ctx.beginPath();
        //     ctx.arc(screenX, screenY - 20, 15, 0, Math.PI * 2);
        //     ctx.fill();
        // });

        // ctx.restore();
    }

    drawVignette() {
        const gradient = ctx.createRadialGradient(
            VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2, 0,
            VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2, VIEWPORT_WIDTH * 0.7
        );
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    }

    drawMinimap() {
        // 只在小地图可见时绘制
        if (!this.minimapVisible) {
            return;
        }

        // 背景
        minimapCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        minimapCtx.fillRect(0, 0, 150, 150);

        // 缩放比例
        const scale = 150 / Math.max(WORLD_WIDTH, WORLD_HEIGHT);

        // 绘制灯光
        minimapCtx.fillStyle = 'rgba(255, 255, 0, 0.5)';
        this.lights.forEach(light => {
            const x = light.x * scale;
            const y = light.y * scale;
            minimapCtx.beginPath();
            minimapCtx.arc(x, y, 8, 0, Math.PI * 2);
            minimapCtx.fill();
        });

        // 绘制野狗
        minimapCtx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        this.dogs.forEach(dog => {
            const x = dog.x * scale;
            const y = dog.y * scale;
            minimapCtx.fillRect(x - 2, y - 2, 4, 4);
        });

        // 绘制出口
        minimapCtx.fillStyle = 'rgba(0, 255, 0, 1)';
        const exitX = this.exit.x * scale;
        const exitY = this.exit.y * scale;
        minimapCtx.fillRect(exitX - 4, exitY - 4, 8, 8);

        // 绘制猫（玩家）
        minimapCtx.fillStyle = '#fff';
        const catX = this.cat.x * scale;
        const catY = this.cat.y * scale;
        minimapCtx.beginPath();
        minimapCtx.arc(catX, catY, 3, 0, Math.PI * 2);
        minimapCtx.fill();

        // 视野范围
        minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        minimapCtx.lineWidth = 1;
        const viewX = this.camera.x * scale;
        const viewY = this.camera.y * scale;
        const viewW = VIEWPORT_WIDTH * scale;
        const viewH = VIEWPORT_HEIGHT * scale;
        minimapCtx.strokeRect(viewX, viewY, viewW, viewH);
    }

    updateUI() {
        // 根据控制模式更新血量和距离
        let currentEntity = this.controlMode === 'cat' ? this.cat : (this.playerDog || this.cat);

        // 更新血量
        const healthPercent = Math.max(0, (currentEntity.health / currentEntity.maxHealth) * 100);
        document.getElementById('healthFill').style.width = `${healthPercent}%`;

        // 更新距离和角色提示
        const dx = this.exit.x - currentEntity.x;
        const dy = this.exit.y - currentEntity.y;
        const distance = Math.floor(Math.sqrt(dx * dx + dy * dy));
        const roleText = this.controlMode === 'cat' ? '🐱 猫咪' : '🐕 狗狗';
        document.getElementById('distance').textContent = `${roleText} | 距离出口: ${distance}m`;

        // 危险警告
        const warningElement = document.getElementById('warning');
        let dogNearby = false;
        let inSafeZone = false;

        // 检查是否在安全区
        for (let light of this.lights) {
            if (light.isInSafeZone(this.cat.x, this.cat.y)) {
                inSafeZone = true;
                break;
            }
        }

        // 检查野狗是否接近
        for (let dog of this.dogs) {
            const dx = dog.x - this.cat.x;
            const dy = dog.y - this.cat.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < dog.detectionRadius && dog.state === 'chase') {
                dogNearby = true;
                break;
            }
        }

        if (dogNearby && !inSafeZone) {
            warningElement.classList.add('show');
        } else {
            warningElement.classList.remove('show');
        }
    }

    win() {
        gameState.running = false;
        gameState.won = true;
        document.getElementById('gameOverTitle').textContent = '🎉 成功逃脱！';
        document.getElementById('gameOverMessage').textContent = '你成功带领猫咪逃离了危险区域！';
        document.getElementById('gameOver').classList.add('show');
    }

    gameOver() {
        gameState.running = false;
        gameState.won = false;
        document.getElementById('gameOverTitle').textContent = '😿 游戏结束';
        document.getElementById('gameOverMessage').textContent = '猫咪被野狗抓住了...再试一次吧！';
        document.getElementById('gameOver').classList.add('show');
    }

    handleKeyDown(e) {
        // Tab键切换角色
        if (e.code === 'Tab') {
            e.preventDefault(); // 防止浏览器默认行为
            this.switchControl();
            return;
        }

        // ESC键返回菜单
        if (e.code === 'Escape') {
            e.preventDefault();
            returnToMenu();
            return;
        }

        // M键切换小地图显示
        if (e.code === 'KeyM') {
            e.preventDefault();
            this.toggleMinimap();
            return;
        }

        this.keys[e.code] = true;
    }

    toggleMinimap() {
        this.minimapVisible = !this.minimapVisible;
        if (this.minimapVisible) {
            this.minimapElement.classList.add('show');
        } else {
            this.minimapElement.classList.remove('show');
        }
    }

    switchControl() {
        if (this.controlMode === 'cat') {
            // 切换到狗模式
            this.controlMode = 'dog';
            if (!this.playerDog) {
                // 在猫的位置创建玩家控制的狗
                this.playerDog = new PlayerDog(this.cat.x, this.cat.y);
            }
            console.log('切换到控制狗');
        } else {
            // 切换回猫模式
            this.controlMode = 'cat';
            // 将猫传送到狗的位置
            if (this.playerDog) {
                this.cat.x = this.playerDog.x;
                this.cat.y = this.playerDog.y;
            }
            console.log('切换到控制猫');
        }
    }

    handleKeyUp(e) {
        this.keys[e.code] = false;
    }

    handleClick(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left + this.camera.x;
        const y = e.clientY - rect.top + this.camera.y;

        // 根据控制模式设置目标
        if (this.controlMode === 'cat') {
            this.cat.targetX = x;
            this.cat.targetY = y;
        } else if (this.controlMode === 'dog' && this.playerDog) {
            this.playerDog.setMouseTarget(x, y);
        }
        console.log('Set target to:', x, y);
    }
}

// 游戏实例
let game = new GameWorld();

// 事件监听
window.addEventListener('keydown', (e) => game.handleKeyDown(e));
window.addEventListener('keyup', (e) => game.handleKeyUp(e));
canvas.addEventListener('click', (e) => game.handleClick(e));

// 重新开始游戏
function restartGame() {
    gameState.running = true;
    gameState.won = false;
    game = new GameWorld();
    document.getElementById('gameOver').classList.remove('show');
    gameLoop();
}

// 游戏循环
function gameLoop() {
    if (!gameState.running && !gameState.won) return;

    game.update();
    game.draw();

    requestAnimationFrame(gameLoop);
}

// 关卡选择函数
function startLevel(levelNumber) {
    // 隐藏菜单
    const levelMenu = document.getElementById('levelMenu');
    levelMenu.classList.add('hidden');

    // 重置游戏状态
    gameState.running = true;
    gameState.won = false;
    gameState.paused = false;

    // 创建新的游戏世界并设置关卡
    game = new GameWorld();
    game.currentLevel = levelNumber;

    // 清除之前的游戏结束界面
    document.getElementById('gameOver').classList.remove('show');

    // 启动游戏循环
    gameLoop();
}

// 返回菜单函数
function returnToMenu() {
    // 停止游戏
    gameState.running = false;
    gameState.paused = true;

    // 显示菜单
    const levelMenu = document.getElementById('levelMenu');
    levelMenu.classList.remove('hidden');
}

// 启动时显示菜单，不自动开始游戏
window.onload = function() {
    // 确保菜单可见
    const levelMenu = document.getElementById('levelMenu');
    levelMenu.classList.remove('hidden');
};