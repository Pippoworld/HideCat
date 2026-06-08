// NEON SWARM — synthesized audio (WebAudio). No external files.
(function () {
  'use strict';

  const Audio = {
    ctx: null,
    master: null,
    musicGain: null,
    sfxGain: null,
    enabled: true,
    muted: false,
    _musicTimer: null,
    _step: 0,
    intensity: 0, // 0..1, ramps music tempo

    init() {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.musicVol;
        this.musicGain.connect(this.master);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.sfxVol;
        this.sfxGain.connect(this.master);
      } catch (e) {
        this.enabled = false;
      }
    },

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    musicVol: 0.32,
    sfxVol: 0.6,

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.9;
    },

    setMusicVol(v) {
      this.musicVol = v;
      if (this.musicGain) this.musicGain.gain.value = v;
    },

    setSfxVol(v) {
      this.sfxVol = v;
      if (this.sfxGain) this.sfxGain.gain.value = v;
    },

    _now() { return this.ctx.currentTime; },

    // Generic tone
    tone(freq, dur, type, vol, dest, slideTo) {
      if (!this.enabled || !this.ctx) return;
      const t = this._now();
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(dest || this.sfxGain);
      o.start(t);
      o.stop(t + dur + 0.02);
    },

    noise(dur, vol, filterFreq) {
      if (!this.enabled || !this.ctx) return;
      const t = this._now();
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq || 1200;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t);
    },

    // ---- SFX ----
    shoot() { this.tone(720, 0.07, 'square', 0.12, null, 380); },
    shootBig() { this.tone(420, 0.12, 'sawtooth', 0.16, null, 160); },
    hit() { this.tone(220, 0.05, 'square', 0.07, null, 140); },
    kill() { this.noise(0.12, 0.18, 900); this.tone(160, 0.1, 'triangle', 0.1, null, 60); },
    xp() { this.tone(880, 0.05, 'sine', 0.08, null, 1320); },
    coin() { this.tone(1200, 0.06, 'sine', 0.09, null, 1700); },
    hurt() { this.noise(0.18, 0.25, 600); this.tone(120, 0.2, 'sawtooth', 0.16, null, 50); },
    levelup() {
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => this.tone(f, 0.18, 'triangle', 0.16), i * 70);
      });
    },
    select() { this.tone(660, 0.08, 'square', 0.14, null, 880); },
    evolve() {
      [392, 523, 659, 784, 988, 1175].forEach((f, i) => {
        setTimeout(() => this.tone(f, 0.22, 'sawtooth', 0.14), i * 60);
      });
    },
    boss() { this.tone(70, 0.6, 'sawtooth', 0.25, null, 40); this.noise(0.5, 0.2, 300); },
    gameover() {
      [440, 349, 262, 196].forEach((f, i) => {
        setTimeout(() => this.tone(f, 0.4, 'triangle', 0.18), i * 180);
      });
    },

    // ---- Procedural music: simple driving arpeggio bassline ----
    startMusic(intensity) {
      if (!this.enabled || !this.ctx || this._musicTimer) return;
      this._step = 0;
      const tick = () => {
        const bass = [55, 55, 73.42, 65.41]; // A1 A1 D2 C2
        const arp = [220, 277.18, 329.63, 440, 329.63, 277.18];
        const b = bass[Math.floor(this._step / 4) % bass.length];
        // bass
        if (this._step % 2 === 0) this.tone(b, 0.22, 'triangle', 0.18, this.musicGain);
        // arp
        const a = arp[this._step % arp.length];
        this.tone(a, 0.14, 'sawtooth', 0.05, this.musicGain);
        if (this._step % 8 === 0) this.noise(0.04, 0.06, 4000); // hat
        // extra off-beat hat as intensity rises
        if (this.intensity > 0.5 && this._step % 2 === 1) this.noise(0.02, 0.04, 5000);
        this._step++;
        const delay = 165 - this.intensity * 55; // 165ms -> 110ms as tension rises
        this._musicTimer = setTimeout(tick, delay);
      };
      tick();
    },

    stopMusic() {
      if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
    },
  };

  window.Sound = Audio;
})();
