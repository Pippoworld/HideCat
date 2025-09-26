const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

class Cat {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.speed = 3;
        this.width = 60;
        this.height = 50;
        this.animationFrame = 0;
        this.facing = 'right';
        this.isMoving = false;
        this.tailAngle = 0;
        this.earTwitch = 0;
        this.pawAnimation = 0;
    }

    update() {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 5) {
            this.x += (dx / distance) * this.speed;
            this.y += (dy / distance) * this.speed;
            this.isMoving = true;

            if (dx > 0) {
                this.facing = 'right';
            } else if (dx < 0) {
                this.facing = 'left';
            }

            this.animationFrame += 0.2;
            this.pawAnimation += 0.3;
        } else {
            this.isMoving = false;
            this.animationFrame += 0.05;
        }

        this.tailAngle = Math.sin(this.animationFrame) * 0.3;
        this.earTwitch = Math.sin(this.animationFrame * 2) * 0.1;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        if (this.facing === 'left') {
            ctx.scale(-1, 1);
        }

        // 尾巴
        ctx.save();
        ctx.rotate(this.tailAngle);
        ctx.fillStyle = '#FFA500';
        ctx.beginPath();
        ctx.ellipse(-25, 0, 30, 12, -0.5, 0, Math.PI * 2);
        ctx.fill();

        // 尾巴条纹
        ctx.strokeStyle = '#FF6347';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-20, -5);
        ctx.lineTo(-30, -3);
        ctx.moveTo(-25, 0);
        ctx.lineTo(-35, 2);
        ctx.moveTo(-20, 5);
        ctx.lineTo(-30, 7);
        ctx.stroke();
        ctx.restore();

        // 身体阴影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.ellipse(0, 25, 35, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // 后腿
        const legOffset = this.isMoving ? Math.sin(this.pawAnimation) * 5 : 0;
        ctx.fillStyle = '#FFA500';
        ctx.beginPath();
        ctx.ellipse(-15, 15 + legOffset, 12, 18, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(15, 15 - legOffset, 12, 18, -0.1, 0, Math.PI * 2);
        ctx.fill();

        // 身体
        ctx.fillStyle = '#FFA500';
        ctx.beginPath();
        ctx.ellipse(0, 0, 35, 25, 0, 0, Math.PI * 2);
        ctx.fill();

        // 身体条纹
        ctx.strokeStyle = '#FF6347';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, -5, 20, 0.5, 1.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0.3, 1);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 5, 20, 0.1, 0.8);
        ctx.stroke();

        // 前腿
        const frontLegOffset = this.isMoving ? Math.sin(this.pawAnimation + Math.PI) * 5 : 0;
        ctx.fillStyle = '#FFA500';
        ctx.beginPath();
        ctx.ellipse(-12, 18 + frontLegOffset, 10, 15, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(12, 18 - frontLegOffset, 10, 15, -0.1, 0, Math.PI * 2);
        ctx.fill();

        // 爪子
        ctx.fillStyle = '#FFB6C1';
        ctx.beginPath();
        ctx.ellipse(-12, 28 + frontLegOffset, 8, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(12, 28 - frontLegOffset, 8, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-15, 28 + legOffset, 8, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(15, 28 - legOffset, 8, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // 头部
        ctx.save();
        ctx.rotate(this.earTwitch * 0.5);
        ctx.fillStyle = '#FFA500';
        ctx.beginPath();
        ctx.ellipse(25, -10, 25, 22, 0, 0, Math.PI * 2);
        ctx.fill();

        // 耳朵
        ctx.save();
        ctx.rotate(this.earTwitch);

        // 左耳
        ctx.fillStyle = '#FFA500';
        ctx.beginPath();
        ctx.moveTo(10, -25);
        ctx.lineTo(5, -40);
        ctx.lineTo(18, -35);
        ctx.closePath();
        ctx.fill();

        // 右耳
        ctx.beginPath();
        ctx.moveTo(35, -25);
        ctx.lineTo(30, -40);
        ctx.lineTo(43, -35);
        ctx.closePath();
        ctx.fill();

        // 耳朵内部
        ctx.fillStyle = '#FFB6C1';
        ctx.beginPath();
        ctx.moveTo(12, -28);
        ctx.lineTo(10, -35);
        ctx.lineTo(16, -32);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(33, -28);
        ctx.lineTo(31, -35);
        ctx.lineTo(37, -32);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // 脸部条纹
        ctx.strokeStyle = '#FF6347';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(5, -15);
        ctx.lineTo(0, -13);
        ctx.moveTo(5, -10);
        ctx.lineTo(0, -8);
        ctx.moveTo(45, -15);
        ctx.lineTo(50, -13);
        ctx.moveTo(45, -10);
        ctx.lineTo(50, -8);
        ctx.stroke();

        // 眼睛
        ctx.fillStyle = '#000';
        if (Math.random() > 0.98) {
            // 眨眼
            ctx.beginPath();
            ctx.moveTo(15, -12);
            ctx.lineTo(20, -10);
            ctx.moveTo(30, -12);
            ctx.lineTo(35, -10);
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.ellipse(18, -12, 3, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(32, -12, 3, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            // 瞳孔高光
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(19, -13, 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(33, -13, 1, 0, Math.PI * 2);
            ctx.fill();
        }

        // 鼻子
        ctx.fillStyle = '#FFB6C1';
        ctx.beginPath();
        ctx.moveTo(25, -5);
        ctx.lineTo(22, -2);
        ctx.lineTo(28, -2);
        ctx.closePath();
        ctx.fill();

        // 嘴巴
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(25, -2);
        ctx.lineTo(25, 2);
        ctx.moveTo(25, 2);
        ctx.quadraticCurveTo(20, 5, 15, 2);
        ctx.moveTo(25, 2);
        ctx.quadraticCurveTo(30, 5, 35, 2);
        ctx.stroke();

        // 胡须
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(10, -5);
        ctx.lineTo(-5, -7);
        ctx.moveTo(10, 0);
        ctx.lineTo(-5, -2);
        ctx.moveTo(40, -5);
        ctx.lineTo(55, -7);
        ctx.moveTo(40, 0);
        ctx.lineTo(55, -2);
        ctx.stroke();

        ctx.restore();
        ctx.restore();
    }

    setTarget(x, y) {
        this.targetX = x;
        this.targetY = y;
    }
}

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.life = 1;
        this.color = `hsl(${Math.random() * 60 + 30}, 100%, 50%)`;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.05;
        this.life -= 0.02;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// 游戏初始化
const cat = new Cat(canvas.width / 2, canvas.height / 2);
const particles = [];
const decorations = [];

// 生成装饰物
function createDecorations() {
    // 云朵
    for (let i = 0; i < 3; i++) {
        decorations.push({
            type: 'cloud',
            x: Math.random() * canvas.width,
            y: Math.random() * 150 + 50,
            speed: Math.random() * 0.5 + 0.2
        });
    }

    // 花朵
    for (let i = 0; i < 8; i++) {
        decorations.push({
            type: 'flower',
            x: Math.random() * canvas.width,
            y: canvas.height - 50 + Math.random() * 30,
            color: `hsl(${Math.random() * 60 + 300}, 70%, 60%)`
        });
    }
}

function drawDecorations() {
    decorations.forEach(deco => {
        if (deco.type === 'cloud') {
            deco.x += deco.speed;
            if (deco.x > canvas.width + 50) {
                deco.x = -50;
            }

            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath();
            ctx.arc(deco.x, deco.y, 25, 0, Math.PI * 2);
            ctx.arc(deco.x + 20, deco.y, 30, 0, Math.PI * 2);
            ctx.arc(deco.x + 40, deco.y, 25, 0, Math.PI * 2);
            ctx.fill();
        } else if (deco.type === 'flower') {
            ctx.fillStyle = deco.color;
            for (let i = 0; i < 5; i++) {
                const angle = (i / 5) * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(
                    deco.x + Math.cos(angle) * 8,
                    deco.y + Math.sin(angle) * 8,
                    5, 0, Math.PI * 2
                );
                ctx.fill();
            }
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(deco.x, deco.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

createDecorations();

// 鼠标点击事件
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    cat.setTarget(x, y);

    // 创建点击效果粒子
    for (let i = 0; i < 10; i++) {
        particles.push(new Particle(x, y));
    }
});

// 游戏循环
function gameLoop() {
    // 清空画布
    ctx.fillStyle = 'rgba(135, 206, 235, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制草地
    const gradient = ctx.createLinearGradient(0, canvas.height - 100, 0, canvas.height);
    gradient.addColorStop(0, '#90EE90');
    gradient.addColorStop(1, '#228B22');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, canvas.height - 100, canvas.width, 100);

    // 绘制装饰物
    drawDecorations();

    // 更新和绘制粒子
    for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        particle.update();
        particle.draw();

        if (particle.life <= 0) {
            particles.splice(i, 1);
        }
    }

    // 更新和绘制猫猫
    cat.update();
    cat.draw();

    requestAnimationFrame(gameLoop);
}

// 开始游戏
gameLoop();