/**
 * Procedural Water Droplet & Ambient Rain Synthesizer using Web Audio API
 * Generates realistic water drops, ambient rainfall noise, and surface patter without external audio assets.
 */

export type RainAudioIntensity = 'light' | 'medium' | 'heavy';

class WaterSoundSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private lastPlayTime: number = 0;
  private lastPatterTime: number = 0;

  // Rain audio synthesis nodes
  private rainBuffer: AudioBuffer | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainHighpass: BiquadFilterNode | null = null;
  private isRainPlaying: boolean = false;
  private currentIntensity: RainAudioIntensity = 'medium';

  constructor() {
    // Lazily initialized on first interaction
  }

  private initContext(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.rainGain && this.ctx) {
      const t = this.ctx.currentTime;
      if (muted) {
        this.rainGain.gain.cancelScheduledValues(t);
        this.rainGain.gain.setValueAtTime(this.rainGain.gain.value, t);
        this.rainGain.gain.linearRampToValueAtTime(0.0001, t + 0.2);
      } else if (this.isRainPlaying) {
        const targetVol = this.getIntensityVolume(this.currentIntensity);
        this.rainGain.gain.cancelScheduledValues(t);
        this.rainGain.gain.setValueAtTime(0.0001, t);
        this.rainGain.gain.linearRampToValueAtTime(targetVol, t + 0.6);
      }
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Tạo buffer Pink Noise tự nhiên 4 giây cho âm thanh mưa rào
   * Sử dụng thuật toán lọc Kellet cho phổ âm học 1/f tự nhiên của giọt mưa
   */
  private createRainNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    for (let channel = 0; channel < 2; channel++) {
      const data = channel === 0 ? left : right;
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
    return buffer;
  }

  private getIntensityVolume(intensity: RainAudioIntensity): number {
    switch (intensity) {
      case 'light':
        return 0.07;
      case 'heavy':
        return 0.22;
      case 'medium':
      default:
        return 0.13;
    }
  }

  private getIntensityFrequency(intensity: RainAudioIntensity): number {
    switch (intensity) {
      case 'light':
        return 1400;
      case 'heavy':
        return 3400;
      case 'medium':
      default:
        return 2200;
    }
  }

  /**
   * Bật âm thanh mưa rơi liên tục (Ambient Rain Soundscape)
   */
  public startRain(intensity: RainAudioIntensity = 'medium') {
    this.isRainPlaying = true;
    this.currentIntensity = intensity;

    const ctx = this.initContext();
    if (!ctx) return;

    if (!this.rainBuffer) {
      this.rainBuffer = this.createRainNoiseBuffer(ctx);
    }

    // Khởi tạo các node âm thanh mưa nếu chưa có
    if (!this.rainSource) {
      this.rainSource = ctx.createBufferSource();
      this.rainSource.buffer = this.rainBuffer;
      this.rainSource.loop = true;

      // Highpass để lọc tiếng ù bass trầm
      this.rainHighpass = ctx.createBiquadFilter();
      this.rainHighpass.type = 'highpass';
      this.rainHighpass.frequency.setValueAtTime(240, ctx.currentTime);

      // Lowpass để tạo âm mưa êm dịu theo cấp độ
      this.rainFilter = ctx.createBiquadFilter();
      this.rainFilter.type = 'lowpass';
      this.rainFilter.frequency.setValueAtTime(this.getIntensityFrequency(intensity), ctx.currentTime);
      this.rainFilter.Q.setValueAtTime(1.2, ctx.currentTime);

      // Gain điều chỉnh âm lượng
      this.rainGain = ctx.createGain();
      this.rainGain.gain.setValueAtTime(0.0001, ctx.currentTime);

      this.rainSource.connect(this.rainHighpass);
      this.rainHighpass.connect(this.rainFilter);
      this.rainFilter.connect(this.rainGain);
      this.rainGain.connect(ctx.destination);

      try {
        this.rainSource.start(0);
      } catch {
        // Source already started
      }
    }

    // Fade-in âm lượng mượt mà
    if (this.rainGain && !this.isMuted) {
      const t = ctx.currentTime;
      const targetVol = this.getIntensityVolume(intensity);
      this.rainGain.gain.cancelScheduledValues(t);
      this.rainGain.gain.setValueAtTime(Math.max(0.0001, this.rainGain.gain.value), t);
      this.rainGain.gain.linearRampToValueAtTime(targetVol, t + 0.8);
    }

    if (this.rainFilter) {
      this.rainFilter.frequency.setTargetAtTime(this.getIntensityFrequency(intensity), ctx.currentTime, 0.4);
    }
  }

  /**
   * Tắt âm thanh mưa rơi (Fade-out êm dịu)
   */
  public stopRain() {
    this.isRainPlaying = false;
    if (this.rainGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.rainGain.gain.cancelScheduledValues(t);
      this.rainGain.gain.setValueAtTime(this.rainGain.gain.value, t);
      this.rainGain.gain.linearRampToValueAtTime(0.0001, t + 0.6);
    }
  }

  /**
   * Điều chỉnh cấp độ mưa (Mưa phùn / Mưa vừa / Mưa to)
   */
  public setRainIntensity(intensity: RainAudioIntensity) {
    this.currentIntensity = intensity;
    if (!this.isRainPlaying || !this.ctx) return;

    if (this.rainGain && !this.isMuted) {
      const targetVol = this.getIntensityVolume(intensity);
      this.rainGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.5);
    }
    if (this.rainFilter) {
      this.rainFilter.frequency.setTargetAtTime(this.getIntensityFrequency(intensity), this.ctx.currentTime, 0.5);
    }
  }

  /**
   * Âm thanh lách tách li ti khi hạt mưa rơi chạm mặt hồ (Micro-patter tap)
   * Thanh thoát, trong trẻo, không bị ục ục như tiếng giọt nước lớn
   */
  public playRainPatter(panX = 0) {
    if (this.isMuted || !this.isRainPlaying) return;

    const now = performance.now();
    // Giới hạn tần suất để âm thanh róc rách tự nhiên, không bị vỡ tiếng
    if (now - this.lastPatterTime < 75) return;
    this.lastPatterTime = now;

    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Tần số cao trong trẻo của giọt nước nhỏ rơi (1600 - 3200Hz)
      const baseFreq = 1600 + Math.random() * 1400;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * 0.8, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.3, t + 0.012);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, t + 0.045);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(baseFreq, t);
      filter.Q.setValueAtTime(3.0, t);

      // Âm lượng rất nhỏ nhẹ điểm xuyết
      const vol = 0.035 + Math.random() * 0.025;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-0.85, Math.min(0.85, panX)), t);
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
      osc.stop(t + 0.06);
    } catch {
      // AudioContext failed silently
    }
  }

  /**
   * Âm thanh giọt nước tròn lớn khi người dùng bấm/chạm tạo sóng thủ công
   */
  public playDrop(intensity = 0.5, panX = 0) {
    if (this.isMuted) return;

    const now = performance.now();
    // Throttle sounds to avoid audio clipping during rapid mouse movement
    if (now - this.lastPlayTime < 45) return;
    this.lastPlayTime = now;

    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;

      // Base frequency: higher for light raindrops (900-1400Hz), lower for deep drops (400-800Hz)
      const baseFreq = 500 + (1 - Math.min(intensity, 1)) * 600 + Math.random() * 200;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      
      // Frequency envelope: rapid upward then downward pitch sweep characteristic of water surface tension release
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
