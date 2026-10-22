/**
 * Procedural Water Droplet Synthesizer using Web Audio API
 * Generates realistic water "plop" and "drip" sounds without external audio assets.
 */

class WaterSoundSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private lastPlayTime: number = 0;

  constructor() {
    // Initialized lazily on first user interaction due to browser autoplay policies
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public playDrop(intensity = 0.5, panX = 0) {
    if (this.isMuted) return;

    const now = performance.now();
    // Throttle sounds to avoid audio clipping during rapid mouse movement
    if (now - this.lastPlayTime < 45) return;
    this.lastPlayTime = now;

    this.initContext();
    if (!this.ctx) return;

    try {
      const ctx = this.ctx;
      const t = ctx.currentTime;

      // Base frequency: higher for light raindrops (900-1400Hz), lower for deep drops (400-800Hz)
      const baseFreq = 500 + (1 - Math.min(intensity, 1)) * 600 + Math.random() * 200;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      
      // Frequency envelope: rapid upward then downward pitch sweep characteristic of water surface tension tension release
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * 0.7, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, t + 0.015);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, t + 0.12);

      // Resonant bandpass filter
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(baseFreq * 1.2, t);
      filter.Q.setValueAtTime(4.0, t);

      // Volume envelope
      const vol = Math.min(0.08 + intensity * 0.12, 0.22);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

      // Panner if supported
      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panX)), t);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        panner.connect(ctx.destination);
      } else {
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
      }

      osc.start(t);
      osc.stop(t + 0.15);
    } catch {
      // AudioContext interrupted or failed silently
    }
  }
}

export const waterAudio = new WaterSoundSynthesizer();
