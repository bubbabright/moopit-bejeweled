/**
 * Procedural WebAudio SFX engine (interview decision #10) — no audio files, no licensing,
 * no network fetch. Everything is synthesised on demand.
 */

interface ToneOptions {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Optional frequency glide target. */
  sweepTo?: number;
  delay?: number;
  detune?: number;
}

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Must be called from a user gesture before any sound can play. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.34;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(opts: ToneOptions): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    const start = ctx.currentTime + (opts.delay ?? 0);
    const dur = opts.dur;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, start);
    if (opts.sweepTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.sweepTo), start + dur);
    if (opts.detune) osc.detune.value = opts.detune;

    const peak = opts.gain ?? 0.5;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.02, dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  }

  private noise(dur: number, gain: number, filterFrom: number, filterTo: number, delay = 0): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    const start = ctx.currentTime + delay;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFrom, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), start + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  click(): void {
    this.tone({ freq: 620, dur: 0.07, type: 'triangle', gain: 0.28 });
  }

  swap(): void {
    this.tone({ freq: 520, dur: 0.09, type: 'triangle', gain: 0.3, sweepTo: 760 });
  }

  invalid(): void {
    this.tone({ freq: 190, dur: 0.16, type: 'square', gain: 0.16, sweepTo: 120 });
    this.tone({ freq: 196, dur: 0.16, type: 'square', gain: 0.12, delay: 0.02 });
  }

  /** Cascade-depth aware: each step climbs a couple of semitones. */
  match(depth: number): void {
    const step = Math.min(depth, 8);
    const base = 523.25 * Math.pow(2, (step * 2) / 12);
    this.tone({ freq: base, dur: 0.14, type: 'triangle', gain: 0.36 });
    this.tone({ freq: base * 2, dur: 0.1, type: 'sine', gain: 0.16, delay: 0.02 });
  }

  line(): void {
    this.tone({ freq: 900, dur: 0.22, type: 'sawtooth', gain: 0.16, sweepTo: 2100 });
    this.noise(0.22, 0.16, 1800, 5000);
  }

  bomb(): void {
    this.noise(0.36, 0.28, 1400, 90);
    this.tone({ freq: 220, dur: 0.34, type: 'square', gain: 0.16, sweepTo: 60 });
  }

  hyper(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      this.tone({ freq, dur: 0.34, type: 'sine', gain: 0.2, delay: i * 0.045 }),
    );
    this.noise(0.4, 0.12, 3000, 700);
  }

  shuffle(): void {
    for (let i = 0; i < 5; i++) {
      this.tone({ freq: 300 + i * 90, dur: 0.08, type: 'triangle', gain: 0.2, delay: i * 0.05 });
    }
  }

  levelUp(): void {
    [523.25, 659.25, 880, 1174.66].forEach((freq, i) =>
      this.tone({ freq, dur: 0.24, type: 'triangle', gain: 0.26, delay: i * 0.08 }),
    );
  }

  gameOver(): void {
    [440, 349.23, 261.63].forEach((freq, i) =>
      this.tone({ freq, dur: 0.4, type: 'triangle', gain: 0.26, delay: i * 0.16 }),
    );
  }

  newBest(): void {
    [784, 988, 1319, 1568].forEach((freq, i) =>
      this.tone({ freq, dur: 0.3, type: 'sine', gain: 0.24, delay: i * 0.09 }),
    );
  }
}

export const sfx = new Sfx();
