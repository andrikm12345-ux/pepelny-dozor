type Osc = OscillatorType;

export interface Sfx {
  unlock(): void;
  setMuted(muted: boolean): void;
  setMood(mood: Mood): void;
  play(name: SfxName): void;
}

export type Mood = "calm" | "battle";

export type SfxName =
  | "place"
  | "deny"
  | "archer"
  | "ember"
  | "frost"
  | "ballista"
  | "tesla"
  | "banner"
  | "rock"
  | "heal"
  | "shield"
  | "summon"
  | "stun"
  | "spec"
  | "freeze"
  | "event"
  | "hit"
  | "coin"
  | "leak"
  | "wave"
  | "upgrade"
  | "win"
  | "lose"
  | "boom"
  | "boss";

export function createAudio(): Sfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let lastShot = 0;
  let lastCoin = 0;
  let lastHit = 0;
  let lastBoom = 0;
  let lastHeal = 0;
  let lastShield = 0;
  let lastStun = 0;
  let noiseBuf: AudioBuffer | null = null;
  let mood: Mood = "calm";
  let music: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  let pulse: ReturnType<typeof setInterval> | null = null;

  function ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx) {
      ctx = new Ctx({ latencyHint: "interactive" });
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.22;
      master.connect(ctx.destination);
      startMusic(ctx, master);
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

  /** Низкий гул заставы: две расстроенные ноты через фильтр, который медленно дышит. */
  function startMusic(ac: AudioContext, out: GainNode) {
    const gain = ac.createGain();
    gain.gain.value = 0;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 180;
    filter.Q.value = 2;
    filter.connect(gain);
    gain.connect(out);
    const voices: Array<[number, Osc, number]> = [
      [55, "sawtooth", 0.5],
      [55.4, "sawtooth", 0.4],
      [82.41, "triangle", 0.6],
      [110.3, "sine", 0.25],
    ];
    for (const [freq, type, level] of voices) {
      const osc = ac.createOscillator();
      const amp = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      amp.gain.value = level;
      osc.connect(amp);
      amp.connect(filter);
      osc.start();
    }
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = 0.07;
    depth.gain.value = 70;
    lfo.connect(depth);
    depth.connect(filter.frequency);
    lfo.start();
    music = { gain, filter };
    applyMood();
  }

  function applyMood() {
    if (!ctx || !music) return;
    const t = ctx.currentTime;
    const battle = mood === "battle";
    music.gain.gain.setTargetAtTime(battle ? 0.11 : 0.06, t, 1.2);
    music.filter.frequency.setTargetAtTime(battle ? 420 : 180, t, 1.5);
    if (battle && !pulse) {
      pulse = setInterval(drum, 860);
    } else if (!battle && pulse) {
      clearInterval(pulse);
      pulse = null;
    }
  }

  /** Удар барабана в такт бою — идёт в музыкальную шину, поэтому тише эффектов. */
  function drum() {
    const ac = ctx;
    if (!ac || !music || muted || ac.state !== "running") return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(72, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.28);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(amp);
    amp.connect(music.gain);
    osc.start(t);
    osc.stop(t + 0.35);
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
    };
  }

  function noise(dur: number, gain: number, cutoff: number, delay = 0) {
    const ac = ctx;
    if (!ac || !master || muted) return;
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.6), ac.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const amp = ac.createGain();
    src.buffer = noiseBuf;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff * 0.2), t + dur);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
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
    tesla: () => {
      shot(1400, 0.08, "sawtooth", 0.03, -900);
      noise(0.1, 0.025, 6000);
    },
    banner: () => {},
    rock: () => {
      noise(0.55, 0.09, 700);
      tone(60, 0.5, "sine", 0.07, -25);
      tone(110, 0.25, "square", 0.03, -60, 0.04);
    },
    heal: () => {
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now - lastHeal < 250) return;
      lastHeal = now;
      tone(660, 0.12, "sine", 0.018);
      tone(990, 0.14, "sine", 0.014, 0, 0.07);
    },
    shield: () => {
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now - lastShield < 60) return;
      lastShield = now;
      tone(1500 + Math.random() * 200, 0.05, "square", 0.018);
      tone(2200, 0.04, "triangle", 0.012, 0, 0.02);
    },
    summon: () => {
      tone(180, 0.35, "sawtooth", 0.035, 140);
      tone(270, 0.3, "sine", 0.03, 90, 0.08);
      noise(0.25, 0.02, 1500);
    },
    stun: () => {
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now - lastStun < 120) return;
      lastStun = now;
      tone(330, 0.06, "square", 0.025, -150);
    },
    spec: () => {
      tone(392, 0.12, "triangle", 0.04);
      tone(587, 0.14, "triangle", 0.035, 0, 0.08);
      tone(784, 0.3, "sine", 0.035, 0, 0.16);
    },
    freeze: () => {
      noise(0.5, 0.05, 5000);
      tone(1760, 0.5, "sine", 0.03, -1200);
      tone(880, 0.6, "triangle", 0.025, -500, 0.05);
    },
    event: () => {
      tone(330, 0.12, "triangle", 0.035);
      tone(415, 0.12, "triangle", 0.03, 0, 0.1);
    },
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
    boom: () => {
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now - lastBoom < 90) return;
      lastBoom = now;
      noise(0.32, 0.07, 900);
      tone(70, 0.3, "sine", 0.05, -30);
    },
    boss: () => {
      tone(55, 1.4, "sawtooth", 0.05, -8);
      tone(82, 1.4, "triangle", 0.045, -6, 0.05);
      noise(1.2, 0.04, 400);
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
    setMood(next) {
      if (next === mood) return;
      mood = next;
      applyMood();
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
