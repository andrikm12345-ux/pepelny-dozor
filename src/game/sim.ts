import {
  DIFFICULTIES,
  ENEMIES,
  MAX_RANK,
  PREP_SECONDS,
  SELL_RATIO,
  TOWERS,
  WAVES,
  WAYPOINTS,
  dmgMult,
  isInside,
  isRoad,
  rateMult,
  upgradeCost,
  wavePreview,
  type Difficulty,
  type EnemyKind,
  type TargetMode,
  type TowerKind,
  type WaveEntry,
} from "./balance";
import { createAudio, type SfxName } from "./audio";

const SAVE_KEY = "pepelny-dozor-v1";

type PerDifficulty = Record<Difficulty, number>;

function perDifficulty(): PerDifficulty {
  return { easy: 0, normal: 0, hard: 0 };
}

function readPer(value: unknown): PerDifficulty {
  const out = perDifficulty();
  if (!value || typeof value !== "object") return out;
  for (const key of Object.keys(out) as Difficulty[]) {
    const n = (value as Record<string, unknown>)[key];
    if (typeof n === "number" && Number.isFinite(n)) out[key] = n;
  }
  return out;
}

export type Phase = "menu" | "prep" | "combat" | "victory" | "defeat";

export interface Creep {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  wpi: number;
  travel: number;
  hp: number;
  maxHp: number;
  speed: number;
  gold: number;
  armor: number;
  flying: boolean;
  scale: number;
  color: string;
  slow: number;
  slowT: number;
  flash: number;
  alive: boolean;
  vx: number;
  vy: number;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  col: number;
  row: number;
  dmgRank: number;
  rateRank: number;
  spent: number;
  cooldown: number;
  target: TargetMode;
  angle: number;
  recoil: number;
  /** world.anim в момент постройки — для анимации появления. */
  born: number;
}

export interface Shot {
  x: number;
  y: number;
  aimX: number;
  aimY: number;
  speed: number;
  damage: number;
  splash: number;
  slow: number;
  slowTime: number;
  pierce: boolean;
  hitsFlying: boolean;
  color: string;
  kind: TowerKind;
  targetId: number | null;
  life: number;
  alive: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
  color: string;
}

/** Расходящееся кольцо: ударная волна, иней. */
export interface Ring {
  x: number;
  y: number;
  from: number;
  to: number;
  life: number;
  max: number;
  color: string;
}

/** Пепельный след на земле после смерти твари. */
export interface Decal {
  x: number;
  y: number;
  size: number;
  life: number;
  max: number;
}

/** Короткая вспышка света. */
export interface Flash {
  x: number;
  y: number;
  radius: number;
  color: string;
  life: number;
  max: number;
}

export interface World {
  towers: Tower[];
  enemies: Creep[];
  shots: Shot[];
  particles: Particle[];
  floaters: Floater[];
  rings: Ring[];
  decals: Decal[];
  flashes: Flash[];
  hoverCol: number;
  hoverRow: number;
  build: TowerKind | null;
  selectedId: number;
  phase: Phase;
  shake: number;
  hurt: number;
  anim: number;
}

export interface SelectionView {
  id: number;
  kind: TowerKind;
  name: string;
  blurb: string;
  dmgRank: number;
  rateRank: number;
  dmgCost: number | null;
  rateCost: number | null;
  sell: number;
  target: TargetMode;
  damage: number;
  rate: number;
  range: number;
}

export interface Hud {
  phase: Phase;
  lives: number;
  gold: number;
  wave: number;
  wavesTotal: number;
  prepLeft: number | null;
  killed: number;
  leaked: number;
  cleared: number;
  bestWave: number;
  wins: number;
  difficulty: Difficulty;
  livesTotal: number;
  /** Чит: золото не тратится. */
  cheat: boolean;
  paused: boolean;
  speed: 1 | 2;
  muted: boolean;
  build: TowerKind | null;
  selection: SelectionView | null;
  nextGroups: WaveEntry[];
  banner: string;
  combatLeft: number;
  combatTotal: number;
  earlyBonus: number;
}

export interface Sim {
  world: World;
  subscribe(listener: () => void): () => void;
  getSnapshot(): Hud;
  unlock(): void;
  loadProgress(): void;
  start(): void;
  restart(): void;
  setDifficulty(difficulty: Difficulty): void;
  togglePause(): void;
  toggleSpeed(): void;
  toggleMute(): void;
  toggleCheat(): void;
  selectBuild(kind: TowerKind): void;
  dismiss(): void;
  setTarget(mode: TargetMode): void;
  upgrade(track: "dmg" | "rate"): void;
  sell(): void;
  callWave(): void;
  pointer(col: number, row: number, type: "move" | "down" | "leave"): void;
  frame(realDt: number): void;
  simulate(seconds: number): void;
}

function dampAngle(current: number, target: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const k = 1 - Math.exp(-12 * dt);
  return current + diff * k;
}

export function createSim(): Sim {
  const audio = createAudio();
  const listeners = new Set<() => void>();
  const occ = new Map<string, number>();
  const byId = new Map<number, Creep>();

  let nextId = 1;
  let phase: Phase = "menu";
  let difficulty: Difficulty = "normal";
  let gold = DIFFICULTIES[difficulty].gold;
  let lives = DIFFICULTIES[difficulty].lives;
  let waveIndex = 0;
  let cleared = 0;
  let killed = 0;
  let leaked = 0;
  let best = perDifficulty();
  let winsBy = perDifficulty();
  let paused = false;
  let speed: 1 | 2 = 1;
  let muted = false;
  let cheat = false;
  /** Чит включали в этом забеге — рекорды не пишем. */
  let cheated = false;
  let build: TowerKind | null = null;
  let selectedId = 0;
  let banner = "";
  let bannerT = 0;
  let prepLeft: number | null = null;
  let prepShown = 0;
  let combatTotal = 0;
  let combatLeft = 0;
  let queue: Array<{ kind: EnemyKind; gap: number }> = [];
  let spawnGap = 0;
  let acc = 0;
  let compactT = 0;
  let dirty = false;

  const world: World = {
    towers: [],
    enemies: [],
    shots: [],
    particles: [],
    floaters: [],
    rings: [],
    decals: [],
    flashes: [],
    hoverCol: -1,
    hoverRow: -1,
    build: null,
    selectedId: 0,
    phase: "menu",
    shake: 0,
    hurt: 0,
    anim: 0,
  };

  let snapshot = assemble();

  function assemble(): Hud {
    const tower = world.towers.find((item) => item.id === selectedId) ?? null;
    let selection: SelectionView | null = null;
    if (tower) {
      const def = TOWERS[tower.kind];
      selection = {
        id: tower.id,
        kind: tower.kind,
        name: def.name,
        blurb: def.blurb,
        dmgRank: tower.dmgRank,
        rateRank: tower.rateRank,
        dmgCost: tower.dmgRank >= MAX_RANK ? null : upgradeCost(def.cost, tower.dmgRank),
        rateCost: tower.rateRank >= MAX_RANK ? null : upgradeCost(def.cost, tower.rateRank),
        sell: Math.floor(tower.spent * SELL_RATIO),
        target: tower.target,
        damage: Math.round(def.damage * dmgMult(tower.dmgRank)),
        rate: Math.round(def.rate * rateMult(tower.rateRank) * 10) / 10,
        range: def.range,
      };
    }
    return {
      phase,
      lives,
      gold,
      wave: waveIndex + 1,
      wavesTotal: WAVES.length,
      prepLeft: phase === "prep" ? prepLeft : null,
      killed,
      leaked,
      cleared,
      bestWave: best[difficulty],
      wins: winsBy[difficulty],
      difficulty,
      livesTotal: DIFFICULTIES[difficulty].lives,
      cheat,
      paused,
      speed,
      muted,
      build,
      selection,
      nextGroups: phase === "victory" ? [] : wavePreview(waveIndex),
      banner: bannerT > 0 ? banner : "",
      combatLeft,
      combatTotal,
      earlyBonus: phase === "prep" && prepLeft !== null ? Math.max(0, Math.ceil(prepLeft)) : 0,
    };
  }

  function emit() {
    audio.setMood(phase === "combat" ? "battle" : "calm");
    world.phase = phase;
    world.build = build;
    world.selectedId = selectedId;
    snapshot = assemble();
    for (const listener of listeners) listener();
  }

  function flush() {
    dirty = false;
    emit();
  }

  function say(text: string) {
    banner = text;
    bannerT = 2.3;
    flush();
  }

  function sfx(name: SfxName) {
    audio.play(name);
  }

  /** Хватает ли золота; в чит-режиме — всегда. */
  function canPay(cost: number) {
    return cheat || gold >= cost;
  }

  function pay(cost: number) {
    if (!cheat) gold -= cost;
  }

  function noteBest() {
    if (cheated) return;
    if (cleared > best[difficulty]) best[difficulty] = cleared;
  }

  function save() {
    noteBest();
    persist();
  }

  function persist() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, best, wins: winsBy, difficulty }));
    } catch {
      /* private mode */
    }
  }

  function burst(x: number, y: number, color: string, count: number, speed = 1.4) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random());
      world.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.35 + Math.random() * 0.35,
        max: 0.7,
        color,
        size: 0.06 + Math.random() * 0.08,
      });
    }
    if (world.particles.length > 280) world.particles.splice(0, world.particles.length - 280);
  }

  function float(x: number, y: number, text: string, color: string) {
    world.floaters.push({ x, y, text, life: 0.9, max: 0.9, color });
    if (world.floaters.length > 30) world.floaters.shift();
  }

  function addRing(x: number, y: number, from: number, to: number, color: string, life: number) {
    world.rings.push({ x, y, from, to, color, life, max: life });
    if (world.rings.length > 40) world.rings.shift();
  }

  function addDecal(x: number, y: number, size: number) {
    world.decals.push({ x, y, size, life: 9, max: 9 });
    if (world.decals.length > 60) world.decals.shift();
  }

  function addFlash(x: number, y: number, radius: number, color: string, life: number) {
    world.flashes.push({ x, y, radius, color, life, max: life });
    if (world.flashes.length > 80) world.flashes.shift();
  }

  function syncCombat() {
    let alive = 0;
    for (const enemy of world.enemies) if (enemy.alive) alive++;
    const left = queue.length + alive;
    if (left !== combatLeft) {
      combatLeft = left;
      dirty = true;
    }
  }

  function killEnemy(enemy: Creep) {
    if (!enemy.alive) return;
    enemy.alive = false;
    gold += enemy.gold;
    killed++;
    float(enemy.x, enemy.y - 0.2, `+${enemy.gold}`, "#e2b15a");
    burst(enemy.x, enemy.y, enemy.color, enemy.kind === "boss" ? 18 : 8, enemy.kind === "boss" ? 2.2 : 1.3);
    addDecal(enemy.x, enemy.y, enemy.scale);
    addFlash(enemy.x, enemy.y, 1.3, enemy.color, 0.3);
    if (enemy.kind === "boss") {
      world.shake = Math.min(1, world.shake + 0.65);
      addRing(enemy.x, enemy.y, 0.3, 3.2, "#e2b15a", 0.8);
      addFlash(enemy.x, enemy.y, 4, "#ffb35a", 0.7);
      sfx("boom");
    }
    sfx("coin");
    dirty = true;
  }

  function leakEnemy(enemy: Creep) {
    if (!enemy.alive) return;
    enemy.alive = false;
    leaked++;
    if (phase !== "defeat") {
      lives = Math.max(0, lives - 1);
      world.shake = Math.min(1, world.shake + (enemy.kind === "boss" ? 1 : 0.55));
      world.hurt = 1;
      const gate = WAYPOINTS[WAYPOINTS.length - 1]!;
      float(gate.x, gate.y - 0.4, "−1", "#e25b3a");
      addFlash(gate.x, gate.y, 2.4, "#e25b3a", 0.5);
      sfx("leak");
      if (lives <= 0) {
        phase = "defeat";
        paused = false;
        banner = "Димон пал";
        bannerT = 3;
        sfx("lose");
        save();
      }
    }
    dirty = true;
  }

  function hurtEnemy(enemy: Creep, shot: Shot) {
    let amount = shot.damage;
    if (enemy.armor < 1 && !shot.pierce) amount *= enemy.armor;
    enemy.hp -= amount;
    enemy.flash = 0.14;
    if (shot.kind === "ballista") float(enemy.x, enemy.y - 0.45, `${Math.round(amount)}`, "#ffd88a");
    if (shot.slow > 0 && shot.slowTime > 0) {
      if (enemy.slowT <= 0 || shot.slow < enemy.slow) enemy.slow = shot.slow;
      enemy.slowT = Math.max(enemy.slowT, shot.slowTime);
    }
    sfx("hit");
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function impact(shot: Shot, x: number, y: number) {
    shot.alive = false;
    const radius = shot.splash > 0 ? shot.splash : 0.3;
    const r2 = radius * radius;
    for (const enemy of world.enemies) {
      if (!enemy.alive) continue;
      if (enemy.flying && !shot.hitsFlying) continue;
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      if (dx * dx + dy * dy <= r2) hurtEnemy(enemy, shot);
    }
    burst(x, y, shot.color, shot.splash > 0 ? 12 : 5, shot.splash > 0 ? 1.8 : 1);
    if (shot.splash > 0) {
      addRing(x, y, 0.15, shot.splash, "#ff8a4a", 0.45);
      addFlash(x, y, 2.2, "#ff8a4a", 0.35);
      sfx("boom");
    } else if (shot.slow > 0) {
      addRing(x, y, 0.1, 0.55, "#cfe7f0", 0.35);
      addFlash(x, y, 0.9, "#9ec4d4", 0.2);
    } else {
      addFlash(x, y, shot.kind === "ballista" ? 1.2 : 0.6, shot.color, 0.15);
    }
  }

  function spawn(kind: EnemyKind) {
    const def = ENEMIES[kind];
    const hp = Math.round(def.hp * DIFFICULTIES[difficulty].hp);
    const origin = WAYPOINTS[0]!;
    const next = WAYPOINTS[1] ?? origin;
    const ang = Math.atan2(next.y - origin.y, next.x - origin.x);
    const side = (Math.random() - 0.5) * 0.18;
    const enemy: Creep = {
      id: nextId++,
      kind,
      x: origin.x + Math.cos(ang + Math.PI / 2) * side,
      y: origin.y + Math.sin(ang + Math.PI / 2) * side,
      wpi: 1,
      travel: 0,
      hp,
      maxHp: hp,
      speed: def.speed,
      gold: def.gold,
      armor: def.armor,
      flying: def.flying,
      scale: def.scale,
      color: def.color,
      slow: 1,
      slowT: 0,
      flash: 0,
      alive: true,
      vx: 0,
      vy: 0,
    };
    world.enemies.push(enemy);
    byId.set(enemy.id, enemy);
    if (kind === "boss") {
      world.shake = Math.min(1, world.shake + 0.8);
      addFlash(origin.x, origin.y, 3, "#e25b3a", 0.8);
      sfx("boss");
      banner = "Таран вышел на тропу";
      bannerT = 3;
      dirty = true;
    }
  }

  function beginWave(immediate: boolean, bonus = 0) {
    const spec = WAVES[waveIndex];
    if (!spec) return;
    queue = [];
    let first = true;
    for (const group of spec) {
      for (let i = 0; i < group.count; i++) {
        queue.push({ kind: group.kind, gap: first ? 0.25 : group.interval });
        first = false;
      }
    }
    combatTotal = queue.length;
    combatLeft = queue.length;
    spawnGap = queue[0]?.gap ?? 0;
    phase = "combat";
    banner = bonus > 0 ? `+${bonus} золота за спешку` : "";
    bannerT = bonus > 0 ? 2.2 : 0;
    sfx("wave");
    dirty = true;
    if (immediate) flush();
  }

  function onClear() {
    cleared = waveIndex + 1;
    noteBest();
    queue = [];
    combatLeft = 0;
    if (waveIndex >= WAVES.length - 1) {
      phase = "victory";
      banner = "Димон устоял";
      bannerT = 4;
      if (!cheated) winsBy[difficulty] += 1;
      sfx("win");
      save();
    } else {
      waveIndex += 1;
      phase = "prep";
      prepLeft = PREP_SECONDS;
      prepShown = PREP_SECONDS;
      banner = "Димон выдохнул";
      bannerT = 2;
      save();
    }
    dirty = true;
  }

  function resetBoard() {
    world.towers = [];
    world.enemies = [];
    world.shots = [];
    world.particles = [];
    world.floaters = [];
    world.rings = [];
    world.decals = [];
    world.flashes = [];
    occ.clear();
    byId.clear();
    queue = [];
    gold = DIFFICULTIES[difficulty].gold;
    lives = DIFFICULTIES[difficulty].lives;
    waveIndex = 0;
    cleared = 0;
    killed = 0;
    leaked = 0;
    paused = false;
    speed = 1;
    build = null;
    selectedId = 0;
    prepLeft = null;
    prepShown = 0;
    combatTotal = 0;
    combatLeft = 0;
    world.hoverCol = -1;
    world.hoverRow = -1;
    world.shake = 0;
    world.hurt = 0;
    acc = 0;
    cheated = cheat;
    phase = "prep";
    banner = "Башни Димона вдоль тропы";
    bannerT = 3.2;
  }

  function pickTarget(tower: Tower): Creep | null {
    const def = TOWERS[tower.kind];
    const cx = tower.col + 0.5;
    const cy = tower.row + 0.5;
    const r2 = def.range * def.range;
    let best: Creep | null = null;
    let bestScore = 0;
    for (const enemy of world.enemies) {
      if (!enemy.alive) continue;
      if (enemy.flying && !def.hitsFlying) continue;
      const dx = enemy.x - cx;
      const dy = enemy.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      let score = 0;
      if (tower.target === "first") score = enemy.travel;
      else if (tower.target === "last") score = -enemy.travel;
      else if (tower.target === "close") score = -d2;
      else score = enemy.hp;
      if (!best || score > bestScore) {
        best = enemy;
        bestScore = score;
      }
    }
    return best;
  }

  function fire(tower: Tower, target: Creep) {
    const def = TOWERS[tower.kind];
    const damage = def.damage * dmgMult(tower.dmgRank);
    const rate = def.rate * rateMult(tower.rateRank);
    tower.cooldown += 1 / rate;
    tower.recoil = 1;
    const sx = tower.col + 0.5;
    const sy = tower.row + 0.5;
    addFlash(sx + Math.cos(tower.angle) * 0.45, sy + Math.sin(tower.angle) * 0.45, 0.9, def.shot, 0.12);
    world.shots.push({
      x: sx,
      y: sy,
      aimX: target.x,
      aimY: target.y,
      speed: def.shotSpeed,
      damage,
      splash: def.splash,
      slow: def.slow,
      slowTime: def.slowTime,
      pierce: def.pierce,
      hitsFlying: def.hitsFlying,
      color: def.shot,
      kind: tower.kind,
      targetId: target.id,
      life: 2.4,
      alive: true,
    });
    if (world.shots.length > 120) {
      const overflow = world.shots.findIndex((shot) => !shot.alive);
      if (overflow >= 0) world.shots.splice(overflow, 1);
    }
    sfx(tower.kind);
  }

  function tick(dt: number) {
    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0) dirty = true;
    }
    world.hurt = Math.max(0, world.hurt - dt * 1.6);
    world.shake *= Math.exp(-2.8 * dt);

    if (phase === "prep") {
      if (prepLeft !== null) {
        prepLeft -= dt;
        const shown = Math.max(0, Math.ceil(prepLeft));
        if (shown !== prepShown) {
          prepShown = shown;
          dirty = true;
        }
        if (prepLeft <= 0) beginWave(false);
      }
      decayFx(dt);
      return;
    }
    if (phase !== "combat") {
      decayFx(dt);
      return;
    }

    if (queue.length) {
      spawnGap -= dt;
      if (spawnGap <= 0) {
        const item = queue.shift()!;
        spawn(item.kind);
        spawnGap = queue[0]?.gap ?? 0;
        dirty = true;
      }
    }

    for (const enemy of world.enemies) {
      if (!enemy.alive) continue;
      if (enemy.slowT > 0) enemy.slowT = Math.max(0, enemy.slowT - dt);
      if (enemy.flash > 0) enemy.flash = Math.max(0, enemy.flash - dt);
      const mult = enemy.slowT > 0 ? enemy.slow : 1;
      let left = enemy.speed * mult * dt;
      enemy.vx = 0;
      enemy.vy = 0;
      while (left > 0 && enemy.alive) {
        const wp = WAYPOINTS[enemy.wpi];
        if (!wp) {
          leakEnemy(enemy);
          break;
        }
        const dx = wp.x - enemy.x;
        const dy = wp.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.0001) {
          enemy.wpi++;
          if (enemy.wpi >= WAYPOINTS.length) leakEnemy(enemy);
          continue;
        }
        enemy.vx = dx / dist;
        enemy.vy = dy / dist;
        if (dist <= left + 0.0001) {
          enemy.x = wp.x;
          enemy.y = wp.y;
          enemy.travel += dist;
          left -= dist;
          enemy.wpi++;
          if (enemy.wpi >= WAYPOINTS.length) {
            leakEnemy(enemy);
            break;
          }
        } else {
          enemy.x += (dx / dist) * left;
          enemy.y += (dy / dist) * left;
          enemy.travel += left;
          left = 0;
        }
      }
    }

    if (phase !== "combat") {
      decayFx(dt);
      syncCombat();
      return;
    }

    for (const tower of world.towers) {
      tower.cooldown -= dt;
      if (tower.recoil > 0) tower.recoil = Math.max(0, tower.recoil - dt * 3.2);
      const target = pickTarget(tower);
      const cx = tower.col + 0.5;
      const cy = tower.row + 0.5;
      if (target) {
        const aim = Math.atan2(target.y - cy, target.x - cx);
        tower.angle = dampAngle(tower.angle, aim, dt);
        if (tower.cooldown <= 0) fire(tower, target);
      }
    }

    for (const shot of world.shots) {
      if (!shot.alive) continue;
      shot.life -= dt;
      if (shot.life <= 0) {
        shot.alive = false;
        continue;
      }
      const target = shot.targetId != null ? byId.get(shot.targetId) : undefined;
      if (target?.alive) {
        shot.aimX = target.x;
        shot.aimY = target.y;
      }
      const dx = shot.aimX - shot.x;
      const dy = shot.aimY - shot.y;
      const dist = Math.hypot(dx, dy);
      const step = shot.speed * dt;
      if (dist <= Math.max(0.16, step)) impact(shot, shot.aimX, shot.aimY);
      else {
        shot.x += (dx / dist) * step;
        shot.y += (dy / dist) * step;
      }
    }

    decayFx(dt);
    syncCombat();

    compactT += dt;
    if (compactT > 1.2) {
      compactT = 0;
      if (world.enemies.some((enemy) => !enemy.alive)) {
        world.enemies = world.enemies.filter((enemy) => enemy.alive);
        for (const [id, enemy] of byId) if (!enemy.alive) byId.delete(id);
      }
      if (world.shots.some((shot) => !shot.alive)) world.shots = world.shots.filter((shot) => shot.alive);
    }

    if (phase === "combat" && queue.length === 0 && !world.enemies.some((enemy) => enemy.alive)) onClear();
  }

  function decayFx(dt: number) {
    for (const particle of world.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 0.4 * dt;
    }
    if (world.particles.some((particle) => particle.life <= 0)) {
      world.particles = world.particles.filter((particle) => particle.life > 0);
    }
    for (const floater of world.floaters) {
      floater.life -= dt;
      floater.y -= dt * 0.45;
    }
    if (world.floaters.some((floater) => floater.life <= 0)) {
      world.floaters = world.floaters.filter((floater) => floater.life > 0);
    }
    for (const item of world.rings) item.life -= dt;
    for (const item of world.decals) item.life -= dt;
    for (const item of world.flashes) item.life -= dt;
    if (world.rings.some((item) => item.life <= 0)) world.rings = world.rings.filter((item) => item.life > 0);
    if (world.decals.some((item) => item.life <= 0)) world.decals = world.decals.filter((item) => item.life > 0);
    if (world.flashes.some((item) => item.life <= 0)) world.flashes = world.flashes.filter((item) => item.life > 0);
  }

  function place(col: number, row: number) {
    if (phase === "menu" || phase === "victory" || phase === "defeat") return;
    if (!build) return;
    if (!isInside(col, row) || isRoad(col, row)) {
      sfx("deny");
      say("Сюда нельзя — это тропа");
      return;
    }
    const key = `${col},${row}`;
    if (occ.has(key)) {
      sfx("deny");
      say("Клетка занята");
      return;
    }
    const def = TOWERS[build];
    if (!canPay(def.cost)) {
      sfx("deny");
      say("Не хватает золота");
      return;
    }
    pay(def.cost);
    const tower: Tower = {
      id: nextId++,
      kind: build,
      col,
      row,
      dmgRank: 0,
      rateRank: 0,
      spent: def.cost,
      cooldown: Math.random() * 0.25,
      target: "first",
      angle: -Math.PI / 2,
      recoil: 0,
      born: world.anim,
    };
    world.towers.push(tower);
    occ.set(key, tower.id);
    selectedId = tower.id;
    burst(col + 0.5, row + 0.5, "#e2b15a", 8, 1.1);
    sfx("place");
    banner = def.name;
    bannerT = 1.4;
    flush();
  }

  function selectAt(col: number, row: number) {
    const id = occ.get(`${col},${row}`);
    if (!id) {
      selectedId = 0;
      flush();
      return;
    }
    selectedId = id;
    build = null;
    flush();
  }

  return {
    world,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    unlock() {
      audio.unlock();
    },
    loadProgress() {
      if (typeof localStorage === "undefined") return;
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as {
          v?: number;
          bestWave?: number;
          wins?: unknown;
          best?: unknown;
          difficulty?: unknown;
        };
        if (parsed.v === 2) {
          best = readPer(parsed.best);
          winsBy = readPer(parsed.wins);
          if (typeof parsed.difficulty === "string" && parsed.difficulty in DIFFICULTIES) {
            difficulty = parsed.difficulty as Difficulty;
          }
        } else {
          // v1 хранил один рекорд — это был обычный режим.
          if (typeof parsed.bestWave === "number") best.normal = parsed.bestWave;
          if (typeof parsed.wins === "number") winsBy.normal = parsed.wins;
        }
        if (phase === "menu") {
          gold = DIFFICULTIES[difficulty].gold;
          lives = DIFFICULTIES[difficulty].lives;
        }
        flush();
      } catch {
        /* ignore */
      }
    },
    start() {
      audio.unlock();
      resetBoard();
      flush();
    },
    restart() {
      audio.unlock();
      resetBoard();
      flush();
    },
    setDifficulty(next) {
      if (phase !== "menu" && phase !== "victory" && phase !== "defeat") return;
      if (next === difficulty) return;
      difficulty = next;
      if (phase === "menu") {
        gold = DIFFICULTIES[difficulty].gold;
        lives = DIFFICULTIES[difficulty].lives;
      }
      persist();
      flush();
    },
    togglePause() {
      if (phase === "menu" || phase === "victory" || phase === "defeat") return;
      paused = !paused;
      flush();
    },
    toggleSpeed() {
      speed = speed === 1 ? 2 : 1;
      flush();
    },
    toggleCheat() {
      cheat = !cheat;
      if (cheat && phase !== "menu") cheated = true;
      banner = cheat ? "Чит: золото без счёта. Рекорды не пишутся" : "Чит выключен";
      bannerT = 2.6;
      flush();
    },
    toggleMute() {
      audio.unlock();
      muted = !muted;
      audio.setMuted(muted);
      flush();
    },
    selectBuild(kind) {
      if (phase === "menu" || phase === "victory" || phase === "defeat") return;
      audio.unlock();
      if (build === kind) {
        build = null;
        flush();
        return;
      }
      const def = TOWERS[kind];
      if (!canPay(def.cost)) {
        sfx("deny");
        say("Не хватает золота");
        return;
      }
      build = kind;
      selectedId = 0;
      flush();
    },
    dismiss() {
      build = null;
      selectedId = 0;
      world.hoverCol = -1;
      world.hoverRow = -1;
      flush();
    },
    setTarget(mode) {
      const tower = world.towers.find((item) => item.id === selectedId);
      if (!tower) return;
      tower.target = mode;
      flush();
    },
    upgrade(track) {
      const tower = world.towers.find((item) => item.id === selectedId);
      if (!tower) return;
      const rank = track === "dmg" ? tower.dmgRank : tower.rateRank;
      if (rank >= MAX_RANK) return;
      const cost = upgradeCost(TOWERS[tower.kind].cost, rank);
      if (!canPay(cost)) {
        sfx("deny");
        say("Не хватает золота");
        return;
      }
      pay(cost);
      tower.spent += cost;
      if (track === "dmg") tower.dmgRank++;
      else tower.rateRank++;
      burst(tower.col + 0.5, tower.row + 0.5, "#e2b15a", 7, 1);
      sfx("upgrade");
      flush();
    },
    sell() {
      const index = world.towers.findIndex((item) => item.id === selectedId);
      if (index < 0) return;
      const tower = world.towers[index]!;
      const refund = Math.floor(tower.spent * SELL_RATIO);
      gold += refund;
      occ.delete(`${tower.col},${tower.row}`);
      world.towers.splice(index, 1);
      selectedId = 0;
      float(tower.col + 0.5, tower.row + 0.3, `+${refund}`, "#e2b15a");
      sfx("coin");
      flush();
    },
    callWave() {
      audio.unlock();
      if (paused || phase !== "prep") return;
      let bonus = 0;
      if (prepLeft !== null && prepLeft > 0) {
        bonus = Math.ceil(prepLeft);
        gold += bonus;
      }
      beginWave(true, bonus);
    },
    pointer(col, row, type) {
      if (type === "leave") {
        world.hoverCol = -1;
        world.hoverRow = -1;
        return;
      }
      if (!isInside(col, row)) {
        world.hoverCol = -1;
        world.hoverRow = -1;
        return;
      }
      world.hoverCol = col;
      world.hoverRow = row;
      if (type !== "down") return;
      audio.unlock();
      if (phase === "menu" || phase === "victory" || phase === "defeat") return;
      if (occ.has(`${col},${row}`)) {
        selectAt(col, row);
        return;
      }
      if (build) place(col, row);
      else if (selectedId) {
        selectedId = 0;
        flush();
      }
    },
    frame(realDt) {
      world.anim += realDt;
      if (phase === "menu" || phase === "victory" || phase === "defeat" || paused) {
        if (bannerT > 0) {
          bannerT -= realDt;
          if (bannerT <= 0) emit();
        }
        return;
      }
      const capped = Math.min(0.05, Math.max(0, realDt));
      acc += capped * speed;
      const step = 1 / 60;
      let guard = 0;
      while (acc >= step && guard < 12) {
        tick(step);
        acc -= step;
        guard++;
      }
      if (guard === 12) acc = 0;
      if (dirty) flush();
    },
    simulate(seconds) {
      const step = 1 / 60;
      let left = seconds;
      let guard = 0;
      while (left > 0 && guard < 200000) {
        if (phase === "victory" || phase === "defeat" || phase === "menu") break;
        tick(step);
        left -= step;
        guard++;
      }
      if (dirty) flush();
    },
  };
}
