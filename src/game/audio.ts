type Osc = OscillatorType;

export interface Sfx {
  unlock(): void;
  setMuted(muted: boolean): void;
  play(name: SfxName): void;
}

export type SfxName =
  | "place"
  | "deny"
  | "archer"
  | "ember"
  | "frost"
  | "ballista"
  | "hit"
  | "coin"
  | "leak"
  | "wave"
  | "upgrade"
  | "win"
  | "lose";

export function createAudio(): Sfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let lastShot = 0;
  let lastCoin = 0;
  let lastHit = 0;

  function ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx) {
      ctx = new Ctx({ latencyHint: "interactive" });
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.22;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function tone(freq: number, dur: number, type: Osc, gain: number, slide = 0, delay = 0) {
    const ac = ctx;
    if (!ac || !master || muted) return;
    const t = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, freq), t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
    };
  }

  function shot(freq: number, dur: number, type: Osc, gain: number, slide = 0) {
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (now - lastShot < 55) return;
    lastShot = now;
    tone(freq, dur, type, gain, slide);
  }

  const bank: Record<SfxName, () => void> = {
    place: () => {
      tone(196, 0.07, "square", 0.05);
      tone(392, 0.1, "triangle", 0.04);
    },
    deny: () => tone(110, 0.09, "square", 0.04),
    archer: () => shot(640, 0.05, "square", 0.03, 180),
    ember: () => shot(140, 0.12, "sawtooth", 0.04, -50),
    frost: () => shot(720, 0.09, "sine", 0.035, 140),
    ballista: () => shot(90, 0.14, "square", 0.05, -30),
    hit: () => {
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now - lastHit < 40) return;
      lastHit = now;
      tone(480 + Math.random() * 80, 0.04, "triangle", 0.02);
    },
    coin: () => {
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now - lastCoin < 70) return;
      lastCoin = now;
      tone(820, 0.05, "triangle", 0.03);
      tone(1240, 0.08, "sine", 0.025, 0, 0.04);
    },
    leak: () => {
      tone(98, 0.28, "sawtooth", 0.05, -48);
      tone(60, 0.32, "sine", 0.04, -20);
    },
    wave: () => {
      tone(196, 0.18, "triangle", 0.04);
      tone(294, 0.26, "triangle", 0.035, 0, 0.08);
      tone(392, 0.3, "sine", 0.03, 0, 0.16);
    },
    upgrade: () => {
      tone(523, 0.08, "triangle", 0.04);
      tone(784, 0.12, "sine", 0.03, 0, 0.06);
    },
    win: () => {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "triangle", 0.04, 0, i * 0.1));
    },
    lose: () => {
      tone(220, 0.3, "sawtooth", 0.04, -80);
      tone(160, 0.45, "triangle", 0.04, -40, 0.12);
    },
  };

  return {
    unlock() {
      ensure();
    },
    setMuted(next) {
      muted = next;
      if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.22, ctx.currentTime, 0.02);
    },
    play(name) {
      if (!ctx) return;
      bank[name]();
    },
  };
}
