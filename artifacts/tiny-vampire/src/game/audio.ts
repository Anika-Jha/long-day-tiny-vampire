/**
 * Procedural Web Audio engine. No audio files — everything is synthesized so the
 * soundtrack can shift with the time of day, and SFX are generated on the fly.
 */

type Scheduled = { stop: () => void };

const SCALES: Record<string, number[]> = {
  // semitone offsets used to build little loops per level mood
  sushi: [0, 2, 4, 7, 9, 12, 9, 7],
  beach: [0, 4, 7, 11, 7, 4, 2, 0],
  pride: [0, 2, 4, 5, 7, 9, 11, 12],
  turing: [0, 3, 5, 6, 7, 10, 7, 5],
  afternoon: [0, 1, 0, -2, 0, 1, 3, 0],
  sunset: [0, 4, 7, 12, 9, 7, 4, 0],
};

const TEMPOS: Record<string, number> = {
  sushi: 132,
  beach: 110,
  pride: 150,
  turing: 96,
  afternoon: 70,
  sunset: 64,
};

const WAVES: Record<string, OscillatorType> = {
  sushi: "triangle",
  beach: "sine",
  pride: "sawtooth",
  turing: "square",
  afternoon: "sine",
  sunset: "triangle",
};

const BASE_FREQ = 261.63; // middle C

function freq(semi: number) {
  return BASE_FREQ * Math.pow(2, semi / 12);
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private loop: number | null = null;
  private step = 0;
  private current = "";
  private _muted = false;
  private heartbeatTimer: number | null = null;

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);
  }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  get muted() {
    return this._muted;
  }

  setMuted(m: boolean) {
    this._muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  private tone(
    f: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    dest: AudioNode,
    when = 0,
  ): Scheduled {
    if (!this.ctx) return { stop: () => {} };
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return { stop: () => { try { osc.stop(); } catch { /* noop */ } } };
  }

  playMusic(id: string) {
    this.ensure();
    if (this.current === id) return;
    this.current = id;
    if (this.loop) window.clearInterval(this.loop);
    this.stopHeartbeat();
    this.step = 0;
    const scale = SCALES[id] || SCALES.sushi;
    const tempo = TEMPOS[id] || 120;
    const wave = WAVES[id] || "triangle";
    const beatMs = (60 / tempo) * 1000 / 2; // eighth notes
    if (id === "afternoon") this.startHeartbeat();
    this.loop = window.setInterval(() => {
      if (!this.ctx || !this.musicGain) return;
      const i = this.step % scale.length;
      const semi = scale[i];
      // melody
      this.tone(freq(semi + 12), beatMs / 1000 * 0.9, wave, 0.18, this.musicGain);
      // bass on the beat
      if (this.step % 2 === 0) {
        this.tone(freq(scale[0] - 12), beatMs / 1000 * 1.8, "sine", 0.22, this.musicGain);
      }
      // sparkle for pride
      if (id === "pride" && this.step % 2 === 1) {
        this.tone(freq(semi + 24), beatMs / 1000 * 0.5, "triangle", 0.08, this.musicGain);
      }
      this.step++;
    }, beatMs);
  }

  private startHeartbeat() {
    if (!this.ctx || !this.master) return;
    const beat = () => {
      if (!this.ctx || !this.master) return;
      this.tone(60, 0.16, "sine", 0.5, this.master);
      window.setTimeout(() => this.tone(55, 0.16, "sine", 0.4, this.master!), 150);
    };
    beat();
    this.heartbeatTimer = window.setInterval(beat, 1100);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  stopMusic() {
    if (this.loop) window.clearInterval(this.loop);
    this.loop = null;
    this.stopHeartbeat();
    this.current = "";
  }

  // ---- SFX ----
  private sfx(f: number, dur: number, type: OscillatorType, gain = 0.3, slideTo?: number) {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  jump() { this.sfx(320, 0.18, "square", 0.18, 620); }
  bounce() { this.sfx(220, 0.3, "sine", 0.3, 760); }
  collectMoon() { this.sfx(660, 0.12, "triangle", 0.25, 990); window.setTimeout(() => this.sfx(990, 0.14, "triangle", 0.2), 90); }
  collectToken() { this.sfx(520, 0.1, "square", 0.2, 780); }
  collectSticker() { this.sfx(440, 0.1, "triangle", 0.2, 660); window.setTimeout(() => this.sfx(880, 0.18, "triangle", 0.18), 90); }
  checkpoint() { this.sfx(523, 0.12, "sine", 0.25); window.setTimeout(() => this.sfx(784, 0.18, "sine", 0.22), 110); }
  shield() { this.sfx(180, 0.4, "sawtooth", 0.28, 520); }
  ash() { this.sfx(440, 0.5, "sawtooth", 0.3, 90); }
  note(semi: number) { this.sfx(freq(semi + 12), 0.25, "triangle", 0.28); }
  error() { this.sfx(200, 0.25, "square", 0.25, 120); }
  gate() { this.sfx(160, 0.5, "sine", 0.3, 480); }
  heatwave() { this.sfx(150, 0.7, "sawtooth", 0.22, 70); window.setTimeout(() => this.sfx(90, 0.6, "sine", 0.18, 48), 130); }
  win() {
    [0, 4, 7, 12].forEach((s, i) => window.setTimeout(() => this.sfx(freq(s + 12), 0.25, "triangle", 0.25), i * 130));
  }
}

export const audio = new AudioEngine();
