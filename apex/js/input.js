// APEX — input: keyboard + mouse (aim/attack/dash) + touch (move joystick + auto-attack + dash button).
(function () {
  'use strict';

  const Input = {
    keys: {},
    canvas: null,
    isTouch: false,
    // mouse (canvas-space)
    mx: 0, my: 0, mouseDown: false, hasMouse: false,
    // touch move joystick
    touchMove: false, moveX: 0, moveY: 0,
    joyBaseX: 0, joyBaseY: 0, joyX: 0, joyY: 0, _movePid: null,
    // edge-triggered dash
    dashQueued: false,

    init(canvas) {
      this.canvas = canvas;

      window.addEventListener('keydown', (e) => {
        if (e.repeat) { if (['Space'].includes(e.code)) e.preventDefault(); return; }
        this.keys[e.code] = true;
        if (e.code === 'Space') { this.dashQueued = true; e.preventDefault(); }
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      }, { passive: false });
      window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
      window.addEventListener('blur', () => { this.keys = {}; this.mouseDown = false; this.touchMove = false; this._movePid = null; });

      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      canvas.addEventListener('pointerdown', (e) => this._down(e), { passive: false });
      canvas.addEventListener('pointermove', (e) => this._move(e), { passive: false });
      canvas.addEventListener('pointerup', (e) => this._up(e));
      canvas.addEventListener('pointercancel', (e) => this._up(e));
    },

    _rel(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; },

    _down(e) {
      if (window.Sound) Sound.resume();
      const p = this._rel(e);
      if (e.pointerType === 'mouse') {
        this.hasMouse = true; this.mx = p.x; this.my = p.y;
        if (e.button === 0) this.mouseDown = true;
        if (e.button === 2) this.dashQueued = true; // right-click dash
        return;
      }
      // touch: left half = move joystick (right half handled by DOM dash button)
      this.isTouch = true;
      if (p.x < this.canvas.clientWidth * 0.55 && this._movePid === null) {
        this._movePid = e.pointerId; this.touchMove = true;
        this.joyBaseX = p.x; this.joyBaseY = p.y; this.joyX = p.x; this.joyY = p.y;
        this.moveX = 0; this.moveY = 0;
      }
      e.preventDefault();
    },

    _move(e) {
      const p = this._rel(e);
      if (e.pointerType === 'mouse') { this.mx = p.x; this.my = p.y; this.hasMouse = true; return; }
      if (e.pointerId === this._movePid) {
        this.joyX = p.x; this.joyY = p.y;
        let dx = p.x - this.joyBaseX, dy = p.y - this.joyBaseY;
        const len = Math.hypot(dx, dy), dead = 6, maxR = 64;
        if (len < dead) { this.moveX = 0; this.moveY = 0; return; }
        if (len > maxR) { this.joyX = this.joyBaseX + dx / len * maxR; this.joyY = this.joyBaseY + dy / len * maxR; }
        const m = Math.min(1, len / maxR);
        this.moveX = dx / len * m; this.moveY = dy / len * m;
        e.preventDefault();
      }
    },

    _up(e) {
      if (e.pointerType === 'mouse') { if (e.button === 0) this.mouseDown = false; return; }
      if (e.pointerId === this._movePid) { this._movePid = null; this.touchMove = false; this.moveX = 0; this.moveY = 0; }
    },

    // normalized move vector
    getMove() {
      let kx = 0, ky = 0; const k = this.keys;
      if (k.ArrowLeft || k.KeyA) kx -= 1;
      if (k.ArrowRight || k.KeyD) kx += 1;
      if (k.ArrowUp || k.KeyW) ky -= 1;
      if (k.ArrowDown || k.KeyS) ky += 1;
      if (kx || ky) { const l = Math.hypot(kx, ky); return { x: kx / l, y: ky / l }; }
      if (this.touchMove) return { x: this.moveX, y: this.moveY };
      return { x: 0, y: 0 };
    },

    // aim angle from a player screen position; null if no pointer aim (touch -> game uses fallback)
    aimAngle(px, py) {
      if (this.hasMouse && !this.isTouch) return Math.atan2(this.my - py, this.mx - px);
      return null;
    },

    // is the player actively trying to attack? desktop: hold LMB or hold Space-less; touch: always auto
    wantAttack() {
      if (this.isTouch) return true;
      return this.mouseDown || this.keys.KeyJ || this.keys.Enter;
    },

    consumeDash() { if (this.dashQueued) { this.dashQueued = false; return true; } return false; },

    reset() { this.keys = {}; this.mouseDown = false; this.touchMove = false; this.moveX = 0; this.moveY = 0; this._movePid = null; this.dashQueued = false; },
  };

  window.Input = Input;
})();
