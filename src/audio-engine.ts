/**
 * AudioManager — Synthesized audio engine for the Akumen Code pirate theme.
 *
 * All sounds are synthesized via the Web Audio API. No external audio files needed.
 * This is intentionally placeholder-quality; real audio files can be swapped in later.
 *
 * Audio requires a user gesture to start (browser autoplay restrictions).
 * The "Set Sail" button calls initAudio() to create the AudioContext.
 *
 * Sound categories:
 * - Background ambience: filtered white noise simulating ocean waves
 * - Typing clicks: short synthesized wooden-click sounds with randomized pitch
 * - Event sounds: cannon-fuse on Run, success chime, error tone, warning chime
 */

type SoundType = 'cannon' | 'success' | 'error' | 'warning' | 'click';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private _muted = false;
  private _initialized = false;

  get initialized(): boolean {
    return this._initialized;
  }

  get muted(): boolean {
    return this._muted;
  }

  /** Initialize the AudioContext. Must be called from a user gesture. */
  init(): void {
    if (this._initialized) return;

    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.6;
      this.masterGain.connect(this.ctx.destination);
      this._initialized = true;
      this.startAmbience();
    } catch (e) {
      console.warn('AudioManager: Web Audio API not available', e);
    }
  }

  /** Toggle mute state. */
  toggleMute(): boolean {
    this._muted = !this._muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this._muted ? 0 : 0.6,
        this.ctx!.currentTime,
        0.05,
      );
    }
    return this._muted;
  }

  /** Start the background ocean ambience — very quiet filtered noise. */
  private startAmbience(): void {
    if (!this.ctx || !this.masterGain) return;

    const bufferSize = this.ctx.sampleRate * 8; // 8 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate noise with slow wave-like amplitude modulation
    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.ctx.sampleRate;
      // Modulate amplitude with a slow sine to simulate waves
      const wave = 0.3 + 0.7 * Math.sin(2 * Math.PI * 0.08 * t) * 0.5 + 0.5;
      data[i] = (Math.random() * 2 - 1) * 0.015 * wave;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Bandpass filter to make it sound more like ocean
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.5;

    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0.3;

    source.connect(filter);
    filter.connect(this.ambienceGain);
    this.ambienceGain.connect(this.masterGain);
    source.start();
    this.ambienceSource = source;
  }

  /** Play a specific sound effect. */
  play(type: SoundType): void {
    if (!this.ctx || !this.masterGain || this._muted) return;

    switch (type) {
      case 'cannon':
        this.playCannon();
        break;
      case 'success':
        this.playSuccess();
        break;
      case 'error':
        this.playError();
        break;
      case 'warning':
        this.playWarning();
        break;
      case 'click':
        this.playClick();
        break;
    }
  }

  /** Cannon-fuse sound — rising noise burst. */
  private playCannon(): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    // Add a short noise burst for the "boom"
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, ctx.currentTime + 0.1);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    noiseSource.connect(noiseGain);
    noiseGain.connect(this.masterGain!);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    noiseSource.start(ctx.currentTime + 0.1);
    noiseSource.stop(ctx.currentTime + 0.5);
  }

  /** Success chime — ascending two-note major chord. */
  private playSuccess(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.12, now + i * 0.12 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.5);
    });
  }

  /** Error tone — short descending minor interval. */
  private playError(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    [349.23, 293.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.1, now + i * 0.15 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.35);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.4);
    });
  }

  /** Warning chime — single bell-like tone. */
  private playWarning(): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 880;

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  }

  /** Typing click — very short noise burst with randomized pitch. */
  private playClick(): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Randomize between 3–5 pitch variants
    const pitches = [1200, 1400, 1600, 1800, 2000];
    const pitch = pitches[Math.floor(Math.random() * pitches.length)];

    osc.type = 'square';
    osc.frequency.value = pitch;

    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.04);
  }

  /** Clean up audio resources. */
  dispose(): void {
    if (this.ambienceSource) {
      try { this.ambienceSource.stop(); } catch { /* already stopped */ }
    }
    if (this.ctx) {
      this.ctx.close();
    }
    this._initialized = false;
  }
}

/** Singleton audio engine instance. */
export const audioEngine = new AudioEngine();
