// NEON SWARM — input: keyboard + touch/pointer drag joystick.
(function () {
  'use strict';

  const Input = {
    keys: {},
    // movement vector (normalized-ish), set by either keyboard or touch
    moveX: 0,
    moveY: 0,
    touchActive: false,
    // joystick visual state (screen coords)
    joyBaseX: 0, joyBaseY: 0, joyX: 0, joyY: 0,
    _pointerId: null,
    canvas: null,

    init(canvas) {
      this.canvas = canvas;

      window.addEventListener('keydown', (e) => {
        this.keys[e.code] = true;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      }, { passive: false });
      window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
      window.addEventListener('blur', () => { this.keys = {}; });

      // Pointer (covers mouse + touch)
      canvas.addEventListener('pointerdown', (e) => this._down(e), { passive: false });
      canvas.addEventListener('pointermove', (e) => this._move(e), { passive: false });
      canvas.addEventListener('pointerup', (e) => this._up(e));
      canvas.addEventListener('pointercancel', (e) => this._up(e));
    },

    _down(e) {
      if (this._pointerId !== null) return;
      this._pointerId = e.pointerId;
      this.touchActive = true;
      const r = this.canvas.getBoundingClientRect();
      this.joyBaseX = e.clientX - r.left;
      this.joyBaseY = e.clientY - r.top;
      this.joyX = this.joyBaseX;
      this.joyY = this.joyBaseY;
      this.moveX = 0; this.moveY = 0;
      e.preventDefault();
    },

    _move(e) {
      if (e.pointerId !== this._pointerId) return;
      const r = this.canvas.getBoundingClientRect();
      this.joyX = e.clientX - r.left;
      this.joyY = e.clientY - r.top;
      let dx = this.joyX - this.joyBaseX;
      let dy = this.joyY - this.joyBaseY;
      const len = Math.hypot(dx, dy);
      const dead = 6;
      const maxR = 70;
      if (len < dead) { this.moveX = 0; this.moveY = 0; return; }
      // clamp joystick knob visual
      if (len > maxR) {
        this.joyX = this.joyBaseX + (dx / len) * maxR;
        this.joyY = this.joyBaseY + (dy / len) * maxR;
      }
      const mag = Math.min(1, len / maxR);
      this.moveX = (dx / len) * mag;
      this.moveY = (dy / len) * mag;
      e.preventDefault();
    },

    _up(e) {
      if (e.pointerId !== this._pointerId) return;
      this._pointerId = null;
      this.touchActive = false;
      this.moveX = 0; this.moveY = 0;
    },

    // Compute final movement direction (keyboard overrides touch when pressed)
    getMove() {
      let kx = 0, ky = 0;
      const k = this.keys;
      if (k.ArrowLeft || k.KeyA) kx -= 1;
      if (k.ArrowRight || k.KeyD) kx += 1;
      if (k.ArrowUp || k.KeyW) ky -= 1;
      if (k.ArrowDown || k.KeyS) ky += 1;
      if (kx !== 0 || ky !== 0) {
        const len = Math.hypot(kx, ky);
        return { x: kx / len, y: ky / len };
      }
      if (this.touchActive) return { x: this.moveX, y: this.moveY };
      return { x: 0, y: 0 };
    },

    reset() {
      this.keys = {};
      this.moveX = 0; this.moveY = 0;
      this.touchActive = false;
      this._pointerId = null;
    },
  };

  window.Input = Input;
})();
