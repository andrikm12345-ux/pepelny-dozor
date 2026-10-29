import {
  ABILITY_COOLDOWN,
  ABILITY_DELAY,
  ABILITY_RADIUS,
  BANNER_MAX,
  BRITTLE_TIME,
  BURN_TIME,
  CHAIN_REACH,
  DIFFICULTIES,
  ENEMIES,
  HEAL_EVERY,
  HEAL_FRACTION,
  HEAL_RADIUS,
  MAX_RANK,
  NO_BUFF,
  PREP_SECONDS,
  SELL_RATIO,
  SPECS,
  SPEC_BY_ID,
  TOWERS,
  MAPS,
  MAP_ORDER,
  WAVES,
  abilityDamage,
  gateOf,
  getMap,
  isInside,
  isRoad,
  specCost,
  specNeed,
  towerStats,
  upgradeCost,
  wavePreview,
  waveScale,
  waveSpec,
  type Buff,
  type Difficulty,
  type EnemyKind,
  type GameMap,
  type MapId,
  type SpecId,
  type TargetMode,
  type TowerKind,
  type WaveEntry,
} from "./balance";
import { createAudio, type SfxName } from "./audio";

const SAVE_KEY = "pepelny-dozor-v1";
const RUN_KEY = "pepelny-dozor-run-v1";

/** Забег между волнами: достаточно, чтобы продолжить с места. */
interface SavedRun {
  v: 1;
  map: MapId;
  difficulty: Difficulty;
  endless: boolean;
  cheated: boolean;
  wave: number;
  gold: number;
  lives: number;
  cleared: number;
  killed: number;
  leaked: number;
  abilityCd: number;
  towers: Array<{
    kind: TowerKind;
    col: number;
    row: number;
    dmgRank: number;
    rateRank: number;
    spent: number;
    target: TargetMode;
    spec: SpecId | null;
  }>;
}

export interface RunSummary {
  wave: number;
  mapId: MapId;
  difficulty: Difficulty;
  endless: boolean;
  towers: number;
}

type PerDifficulty = Record<Difficulty, number>;
type PerMap = Record<MapId, PerDifficulty>;

function perDifficulty(): PerDifficulty {
  return { easy: 0, normal: 0, hard: 0 };
}

function perMap(): PerMap {
  return Object.fromEntries(MAP_ORDER.map((id) => [id, perDifficulty()])) as PerMap;
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

function readPerMap(value: unknown): PerMap {
  const out = perMap();
  if (!value || typeof value !== "object") return out;
  for (const id of MAP_ORDER) out[id] = readPer((value as Record<string, unknown>)[id]);
  return out;
}

export type Phase = "menu" | "prep" | "combat" | "victory" | "defeat";

export interface Creep {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  /** Номер тропы на карте с несколькими порталами. */
  route: number;
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
  /** Секунд до следующего импульса лечения (только у знахарей). */
  healT: number;
  /** Сколько попаданий ещё гасит щит. */
  shield: number;
  /** Секунд стоит на месте после оглушения. */
  stun: number;
  /** Секунд получает больше урона. */
  brittleT: number;
  brittle: number;
  /** Секунд до следующего призыва (только у призывателей). */
  summonT: number;
  /** Кто призвал; 0 — вышел из портала сам. */
  ownerId: number;
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
  spec: SpecId | null;
  /** Усиление от знамён вокруг; пересчитывается при изменении башен. */
  buff: Buff;
  /** Итоговая дальность с рангами, веткой и знамёнами. */
  range: number;
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
  /** Секунд оглушения при попадании. */
  stun: number;
  /** Прибавка к урону, которую получает цель (хрупкость). */
  brittle: number;
  /** Урон в секунду на горящей земле в точке удара. */
  burn: number;
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

/** Молния: ломаная от башни по цепочке тварей. */
export interface Bolt {
  pts: Array<{ x: number; y: number }>;
  life: number;
  max: number;
  /** Прямой луч (пробой баллисты) этого цвета вместо молнии. */
  beam?: string;
}

/** Горящая земля после Пекла. */
export interface Fire {
  x: number;
  y: number;
  radius: number;
  dps: number;
  life: number;
  max: number;
}

/** Обвал Димона, который вот-вот упадёт. */
export interface Strike {
  x: number;
  y: number;
  t: number;
  max: number;
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
  bolts: Bolt[];
  fires: Fire[];
  strikes: Strike[];
  map: GameMap;
  hoverCol: number;
  hoverRow: number;
  /** Положение курсора в клетках с дробной частью — для прицела обвала. */
  hoverFx: number;
  hoverFy: number;
  aiming: boolean;
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
  /** Башня-усилитель: сама не стреляет. */
  support: boolean;
  /** Сколько знамён усиливает эту башню и на сколько процентов. */
  buffed: number;
  buffDmg: number;
  buffRate: number;
  buffRange: number;
  /** Выбранная ветка мастерства. */
  spec: { id: SpecId; name: string; blurb: string; color: string } | null;
  /** Обе ветки башни и их цена; открыты, когда хватает рангов. */
  specs: Array<{ id: SpecId; name: string; blurb: string; color: string }>;
  specCost: number;
  specOpen: boolean;
  /** Сколько рангов нужно для мастерства и сколько уже куплено. */
  specNeed: number;
  ranks: number;
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
  /** Стартовое золото выбранных карты и сложности. */
  goldTotal: number;
  mapId: MapId;
  /** Лучшая волна на каждой карте при выбранной сложности. */
  mapBest: Record<MapId, number>;
  /** Чит: золото не тратится. */
  cheat: boolean;
  /** Идёт бесконечная ночь после 12-й волны. */
  endless: boolean;
  towerCount: number;
  /** Секунд до готовности обвала; 0 — можно бить. */
  abilityLeft: number;
  aiming: boolean;
  savedRun: RunSummary | null;
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
  continueEndless(): void;
  setDifficulty(difficulty: Difficulty): void;
  setMap(id: MapId): void;
  continueRun(): void;
  toggleAim(): void;
  togglePause(): void;
  toggleSpeed(): void;
  toggleMute(): void;
  toggleCheat(): void;
  selectBuild(kind: TowerKind): void;
  dismiss(): void;
  setTarget(mode: TargetMode): void;
  upgrade(track: "dmg" | "rate"): void;
  specialize(spec: SpecId): void;
  sell(): void;
  callWave(): void;
  pointer(col: number, row: number, type: "move" | "down" | "leave", fx?: number, fy?: number): void;
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
  /** Сложность идущего забега; выбор в меню действует со следующей игры. */
  let runDifficulty: Difficulty = difficulty;
  let mapId: MapId = "ash";
  /** Карта идущего забега; выбор после боя действует со следующей игры. */
  let runMap: MapId = mapId;
  let gold = startGold();
  let lives = DIFFICULTIES[difficulty].lives;
  let waveIndex = 0;
  let cleared = 0;
  let killed = 0;
  let leaked = 0;
  let best = perMap();
  let winsBy = perMap();
  let spawnCount = 0;
  let abilityCd = 0;
  let abilityShown = 0;
  let aiming = false;
  let savedRun: SavedRun | null = null;
  let paused = false;
  let speed: 1 | 2 = 1;
  let muted = false;
  let cheat = false;
  /** Чит включали в этом забеге — рекорды не пишем. */
  let cheated = false;
  let endless = false;
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
    bolts: [],
    fires: [],
    strikes: [],
    map: getMap(mapId),
    hoverCol: -1,
    hoverRow: -1,
    hoverFx: -1,
    hoverFy: -1,
    aiming: false,
    build: null,
    selectedId: 0,
    phase: "menu",
    shake: 0,
    hurt: 0,
    anim: 0,
  };

  let snapshot = assemble();

  function statsOf(tower: Tower) {
    return towerStats(tower.kind, tower.dmgRank, tower.rateRank, tower.spec, tower.buff);
  }

  /** Усиление от двух самых сильных знамён рядом (BANNER_MAX). */
  function bannerBuff(tower: Tower): Buff {
    if (TOWERS[tower.kind].aura > 0) return NO_BUFF;
    const found: Array<ReturnType<typeof towerStats>> = [];
    for (const other of world.towers) {
      const aura = TOWERS[other.kind].aura;
      if (aura <= 0) continue;
      const dx = other.col - tower.col;
      const dy = other.row - tower.row;
      if (dx * dx + dy * dy <= aura * aura) found.push(towerStats(other.kind, 0, 0, other.spec));
    }
    found.sort((a, b) => b.auraDmg + b.auraRate + b.auraRange - (a.auraDmg + a.auraRate + a.auraRange));
    const used = found.slice(0, BANNER_MAX);
    if (!used.length) return NO_BUFF;
    return {
      count: used.length,
      dmg: used.reduce((sum, item) => sum + item.auraDmg, 0),
      rate: used.reduce((sum, item) => sum + item.auraRate, 0),
      range: used.reduce((sum, item) => sum + item.auraRange, 0),
    };
  }

  /** Пересчитать усиление и дальность всех башен: зови после любой смены состава или ветки. */
  function refreshTowers() {
    for (const tower of world.towers) tower.buff = bannerBuff(tower);
    for (const tower of world.towers) tower.range = statsOf(tower).range;
  }

  function assemble(): Hud {
    const tower = world.towers.find((item) => item.id === selectedId) ?? null;
    let selection: SelectionView | null = null;
    if (tower) {
      const def = TOWERS[tower.kind];
      const stats = statsOf(tower);
      const pair = SPECS[tower.kind];
      const chosen = tower.spec ? SPEC_BY_ID[tower.spec] : null;
      const ranks = tower.dmgRank + tower.rateRank;
      const need = specNeed(tower.kind);
      selection = {
        id: tower.id,
        kind: tower.kind,
        name: def.name,
        blurb: def.blurb,
        dmgRank: tower.dmgRank,
        rateRank: tower.rateRank,
        dmgCost: def.aura > 0 || tower.dmgRank >= MAX_RANK ? null : upgradeCost(def.cost, tower.dmgRank),
        rateCost: def.aura > 0 || tower.rateRank >= MAX_RANK ? null : upgradeCost(def.cost, tower.rateRank),
        sell: Math.floor(tower.spent * SELL_RATIO),
        target: tower.target,
        damage: Math.round(stats.damage),
        rate: Math.round(stats.rate * 10) / 10,
        range: Math.round(stats.range * 100) / 100,
        support: def.aura > 0,
        buffed: tower.buff.count,
        buffDmg: Math.round(tower.buff.dmg * 100),
        buffRate: Math.round(tower.buff.rate * 100),
        buffRange: Math.round(tower.buff.range * 100),
        spec: chosen && { id: chosen.id, name: chosen.name, blurb: chosen.blurb, color: chosen.color },
        specs: pair.map((item) => ({ id: item.id, name: item.name, blurb: item.blurb, color: item.color })),
        specCost: specCost(tower.kind),
        specOpen: !tower.spec && ranks >= need,
        specNeed: need,
        ranks,
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
      bestWave: best[mapId][difficulty],
      wins: winsBy[mapId][difficulty],
      difficulty,
      livesTotal: DIFFICULTIES[difficulty].lives,
      goldTotal: startGold(),
      mapId,
      mapBest: Object.fromEntries(MAP_ORDER.map((id) => [id, best[id][difficulty]])) as Record<MapId, number>,
      cheat,
      endless,
      towerCount: world.towers.length,
      abilityLeft: Math.ceil(abilityCd),
      aiming,
      savedRun: savedRun
        ? {
            wave: savedRun.wave + 1,
            mapId: savedRun.map,
            difficulty: savedRun.difficulty,
            endless: savedRun.endless,
            towers: savedRun.towers.length,
          }
        : null,
      paused,
      speed,
      muted,
      build,
      selection,
      nextGroups: wavePreview(phase === "victory" ? waveIndex + 1 : waveIndex),
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
    world.aiming = aiming;
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

  /** Стартовое золото выбранной сложности и карты. */
  function startGold() {
    return DIFFICULTIES[difficulty].gold + MAPS[mapId].gold;
  }

  /** Показать выбранную карту на пустом поле (только в меню). */
  function previewMap() {
    world.map = getMap(mapId);
    gold = startGold();
    lives = DIFFICULTIES[difficulty].lives;
  }

  function noteBest() {
    if (cheated) return;
    const record = best[runMap];
    if (cleared > record[runDifficulty]) record[runDifficulty] = cleared;
  }

  function save() {
    noteBest();
    persist();
  }

  function persist() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 3, best, wins: winsBy, difficulty, map: mapId }));
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
      const gate = gateOf(world.map);
      float(gate.x, gate.y - 0.4, "−1", "#e25b3a");
      addFlash(gate.x, gate.y, 2.4, "#e25b3a", 0.5);
      sfx("leak");
      if (lives <= 0) {
        phase = "defeat";
        paused = false;
        banner = "Димон пал";
        bannerT = 3;
        sfx("lose");
        clearRun();
        save();
      }
    }
    dirty = true;
  }

  function hurtEnemy(enemy: Creep, shot: Shot) {
    if (enemy.shield > 0) {
      // щит гасит любое попадание целиком
      enemy.shield--;
      enemy.flash = 0.14;
      addRing(enemy.x, enemy.y, 0.1, 0.5, "#8fb8d9", 0.25);
      sfx("shield");
      if (enemy.shield === 0) float(enemy.x, enemy.y - 0.5, "щит сбит", "#8fb8d9");
      dirty = true;
      return;
    }
    let amount = shot.damage;
    if (enemy.armor < 1 && !shot.pierce) amount *= enemy.armor;
    if (enemy.brittleT > 0) amount *= 1 + enemy.brittle;
    enemy.hp -= amount;
    enemy.flash = 0.14;
    if (shot.kind === "ballista") float(enemy.x, enemy.y - 0.45, `${Math.round(amount)}`, "#ffd88a");
    if (shot.slow > 0 && shot.slowTime > 0) {
      if (enemy.slowT <= 0 || shot.slow < enemy.slow) enemy.slow = shot.slow;
      enemy.slowT = Math.max(enemy.slowT, shot.slowTime);
    }
    if (shot.stun > 0 && enemy.hp > 0) {
      const time = enemy.kind === "boss" ? Math.min(shot.stun, 0.2) : shot.stun;
      if (time > enemy.stun) {
        enemy.stun = time;
        addRing(enemy.x, enemy.y - 0.3, 0.1, 0.45, "#ffe08a", 0.3);
        sfx("stun");
      }
    }
    if (shot.brittle > 0) {
      enemy.brittle = shot.brittle;
      enemy.brittleT = BRITTLE_TIME;
    }
    sfx("hit");
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  /** Урон от огня: щит не гасит, броня действует. */
  function burnEnemy(enemy: Creep, amount: number) {
    let dmg = amount * (enemy.armor < 1 ? enemy.armor : 1);
    if (enemy.brittleT > 0) dmg *= 1 + enemy.brittle;
    enemy.hp -= dmg;
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
    const blast = shot.kind === "ember";
    burst(x, y, shot.color, blast ? 12 : 5, blast ? 1.8 : 1);
    if (blast) {
      addRing(x, y, 0.15, shot.splash, "#ff8a4a", 0.45);
      addFlash(x, y, 2.2, "#ff8a4a", 0.35);
      sfx("boom");
    } else if (shot.slow > 0) {
      addRing(x, y, 0.1, Math.max(0.55, shot.splash), "#cfe7f0", 0.35);
      addFlash(x, y, 0.9, "#9ec4d4", 0.2);
    } else {
      addFlash(x, y, shot.kind === "ballista" ? 1.2 : 0.6, shot.color, 0.15);
    }
    if (shot.burn > 0) {
      world.fires.push({ x, y, radius: radius * 0.85, dps: shot.burn, life: BURN_TIME, max: BURN_TIME });
      if (world.fires.length > 24) world.fires.shift();
    }
  }

  function makeCreep(kind: EnemyKind, route: number, x: number, y: number, goldShare = 1): Creep {
    const def = ENEMIES[kind];
    const scale = waveScale(waveIndex);
    const hp = Math.round(def.hp * DIFFICULTIES[runDifficulty].hp * scale.hp);
    return {
      id: nextId++,
      kind,
      x,
      y,
      route,
      wpi: 1,
      travel: 0,
      hp,
      maxHp: hp,
      speed: def.speed * scale.speed,
      gold: Math.max(1, Math.round(def.gold * scale.gold * goldShare)),
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
      healT: HEAL_EVERY * Math.random(),
      shield: def.shield ?? 0,
      stun: 0,
      brittleT: 0,
      brittle: 0,
      summonT: def.summon ? def.summon.every * (0.4 + Math.random() * 0.4) : 0,
      ownerId: 0,
    };
  }

  function spawn(kind: EnemyKind) {
    // на карте с двумя порталами твари выходят по очереди из каждого
    const route = spawnCount++ % world.map.routes.length;
    const points = world.map.routes[route]!;
    const origin = points[0]!;
    const next = points[1] ?? origin;
    const ang = Math.atan2(next.y - origin.y, next.x - origin.x);
    const side = (Math.random() - 0.5) * 0.18;
    const enemy = makeCreep(
      kind,
      route,
      origin.x + Math.cos(ang + Math.PI / 2) * side,
      origin.y + Math.sin(ang + Math.PI / 2) * side,
    );
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

  /** Призыватели выпускают угольков на свою тропу, не больше положенного числа живых. */
  function summonPulse(dt: number) {
    for (const boss of world.enemies) {
      if (!boss.alive || boss.kind !== "summoner") continue;
      boss.summonT -= dt;
      if (boss.summonT > 0) continue;
      const rule = ENEMIES.summoner.summon!;
      boss.summonT += rule.every;
      let living = 0;
      for (const other of world.enemies) if (other.alive && other.ownerId === boss.id) living++;
      const n = Math.min(rule.count, rule.cap - living);
      if (n <= 0) continue;
      for (let i = 0; i < n; i++) {
        const minion = makeCreep("mite", boss.route, boss.x + (Math.random() - 0.5) * 0.3, boss.y + (Math.random() - 0.5) * 0.3, 0.5);
        minion.wpi = boss.wpi;
        minion.travel = boss.travel;
        minion.ownerId = boss.id;
        world.enemies.push(minion);
        byId.set(minion.id, minion);
      }
      combatTotal += n;
      addRing(boss.x, boss.y, 0.2, 1.2, "#b78cff", 0.5);
      burst(boss.x, boss.y, "#b78cff", 8, 1);
      sfx("summon");
      dirty = true;
    }
  }

  /** Горящая земля жжёт всех наземных, кто в пятне. */
  function updateFires(dt: number) {
    if (!world.fires.length) return;
    for (const fire of world.fires) {
      fire.life -= dt;
      const r2 = fire.radius * fire.radius;
      for (const enemy of world.enemies) {
        if (!enemy.alive || enemy.flying) continue;
        const dx = enemy.x - fire.x;
        const dy = enemy.y - fire.y;
        if (dx * dx + dy * dy <= r2) burnEnemy(enemy, fire.dps * dt);
      }
    }
    if (world.fires.some((fire) => fire.life <= 0)) world.fires = world.fires.filter((fire) => fire.life > 0);
  }

  function beginWave(immediate: boolean, bonus = 0) {
    const spec = waveSpec(waveIndex);
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
    if (!endless && waveIndex >= WAVES.length - 1) {
      phase = "victory";
      banner = "Димон устоял";
      bannerT = 4;
      if (!cheated) winsBy[runMap][runDifficulty] += 1;
      sfx("win");
      clearRun();
      save();
    } else {
      waveIndex += 1;
      phase = "prep";
      prepLeft = PREP_SECONDS;
      prepShown = PREP_SECONDS;
      banner = "Димон выдохнул";
      bannerT = 2;
      save();
      saveRun();
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
    runDifficulty = difficulty;
    runMap = mapId;
    world.map = getMap(runMap);
    spawnCount = 0;
    abilityCd = 0;
    abilityShown = 0;
    aiming = false;
    world.bolts = [];
    world.fires = [];
    world.strikes = [];
    occ.clear();
    byId.clear();
    queue = [];
    gold = startGold();
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
    endless = false;
    phase = "prep";
    banner = "Башни Димона вдоль тропы";
    bannerT = 3.2;
  }

  /** До n целей в дальности башни, лучшие по режиму «кого бить» первыми. */
  function pickTargets(tower: Tower, n: number): Creep[] {
    const def = TOWERS[tower.kind];
    const hitsFlying = tower.spec === "volcano" || def.hitsFlying;
    const cx = tower.col + 0.5;
    const cy = tower.row + 0.5;
    const r2 = tower.range * tower.range;
    const found: Array<{ enemy: Creep; score: number }> = [];
    for (const enemy of world.enemies) {
      if (!enemy.alive) continue;
      if (enemy.flying && !hitsFlying) continue;
      const dx = enemy.x - cx;
      const dy = enemy.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      let score = 0;
      if (tower.target === "first") score = enemy.travel;
      else if (tower.target === "last") score = -enemy.travel;
      else if (tower.target === "close") score = -d2;
      else score = enemy.hp;
      found.push({ enemy, score });
    }
    if (n === 1) {
      let best: (typeof found)[number] | undefined;
      for (const item of found) if (!best || item.score > best.score) best = item;
      return best ? [best.enemy] : [];
    }
    found.sort((a, b) => b.score - a.score);
    return found.slice(0, n).map((item) => item.enemy);
  }

  /** Выстрел-пустышка для урона, который не летит снарядом: молния, обвал. */
  function plainShot(kind: TowerKind, damage: number, x: number, y: number, color: string, extra: Partial<Shot> = {}): Shot {
    return {
      x,
      y,
      aimX: x,
      aimY: y,
      speed: 0,
      damage,
      splash: 0,
      slow: 0,
      slowTime: 0,
      pierce: false,
      hitsFlying: true,
      color,
      kind,
      targetId: null,
      life: 0,
      alive: false,
      stun: 0,
      brittle: 0,
      burn: 0,
      ...extra,
    };
  }

  /** Молния: бьёт цель и перескакивает на ближайших, теряя силу на каждом прыжке. */
  function zap(tower: Tower, first: Creep, stats: ReturnType<typeof towerStats>) {
    const def = TOWERS[tower.kind];
    const pts = [
      { x: tower.col + 0.5, y: tower.row + 0.5 },
      { x: first.x, y: first.y },
    ];
    const hit = new Set<number>([first.id]);
    let current = first;
    let dmg = stats.damage;
    hurtEnemy(first, plainShot(tower.kind, dmg, first.x, first.y, def.shot, { stun: stats.stun }));
    for (let jump = 0; jump < stats.chain; jump++) {
      let next: Creep | null = null;
      let bestD = CHAIN_REACH * CHAIN_REACH;
      for (const enemy of world.enemies) {
        if (!enemy.alive || hit.has(enemy.id)) continue;
        const dx = enemy.x - current.x;
        const dy = enemy.y - current.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) {
          bestD = d2;
          next = enemy;
        }
      }
      if (!next) break;
      hit.add(next.id);
      dmg *= stats.chainFalloff;
      pts.push({ x: next.x, y: next.y });
      hurtEnemy(next, plainShot(tower.kind, dmg, next.x, next.y, def.shot));
      current = next;
    }
    world.bolts.push({ pts, life: 0.2, max: 0.2 });
    if (world.bolts.length > 30) world.bolts.shift();
    for (const pt of pts.slice(1)) addFlash(pt.x, pt.y, 0.9, def.shot, 0.18);
  }

  /** Пробой: болт баллисты летит насквозь и бьёт всех на линии до края дальности. */
  function beam(tower: Tower, target: Creep, stats: ReturnType<typeof towerStats>) {
    const def = TOWERS[tower.kind];
    const sx = tower.col + 0.5;
    const sy = tower.row + 0.5;
    const len = Math.hypot(target.x - sx, target.y - sy) || 1;
    const ux = (target.x - sx) / len;
    const uy = (target.y - sy) / len;
    const reach = stats.range;
    for (const enemy of world.enemies) {
      if (!enemy.alive) continue;
      const ex = enemy.x - sx;
      const ey = enemy.y - sy;
      const along = ex * ux + ey * uy;
      if (along < 0 || along > reach) continue;
      if (Math.abs(ex * uy - ey * ux) > 0.38) continue;
      hurtEnemy(enemy, plainShot(tower.kind, stats.damage, enemy.x, enemy.y, def.shot, { pierce: true }));
    }
    const end = { x: sx + ux * reach, y: sy + uy * reach };
    world.bolts.push({ pts: [{ x: sx, y: sy }, end], life: 0.22, max: 0.22, beam: def.shot });
    if (world.bolts.length > 30) world.bolts.shift();
    addFlash(end.x, end.y, 1, def.shot, 0.15);
  }

  /** Знахари лечат раненых соседей короткими импульсами. */
  function healPulse(dt: number) {
    for (const healer of world.enemies) {
      if (!healer.alive || healer.kind !== "healer") continue;
      healer.healT -= dt;
      if (healer.healT > 0) continue;
      healer.healT += HEAL_EVERY;
      let healed = 0;
      for (const other of world.enemies) {
        if (!other.alive || other === healer || other.hp >= other.maxHp) continue;
        const dx = other.x - healer.x;
        const dy = other.y - healer.y;
        if (dx * dx + dy * dy > HEAL_RADIUS * HEAL_RADIUS) continue;
        const share = other.kind === "boss" ? 0.4 : 1;
        other.hp = Math.min(other.maxHp, other.hp + other.maxHp * HEAL_FRACTION * share);
        healed++;
      }
      if (healed > 0) {
        addRing(healer.x, healer.y, 0.2, HEAL_RADIUS, "#7dff96", 0.5);
        burst(healer.x, healer.y, "#7dff96", 5, 0.8);
        sfx("heal");
      }
    }
  }

  /** Обвал Димона: сначала предупреждение, потом удар по области. */
  function updateStrikes(dt: number) {
    if (!world.strikes.length) return;
    for (const strike of world.strikes) strike.t -= dt;
    const landed = world.strikes.filter((strike) => strike.t <= 0);
    if (!landed.length) return;
    world.strikes = world.strikes.filter((strike) => strike.t > 0);
    for (const { x, y } of landed) {
      const damage = abilityDamage(waveIndex);
      const r2 = ABILITY_RADIUS * ABILITY_RADIUS;
      for (const enemy of world.enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.x - x;
        const dy = enemy.y - y;
        if (dx * dx + dy * dy > r2) continue;
        enemy.shield = 0;
        hurtEnemy(enemy, plainShot("ballista", damage, x, y, "#e2b15a", { pierce: true, slow: 0.4, slowTime: 2 }));
      }
      addRing(x, y, 0.2, ABILITY_RADIUS, "#e2b15a", 0.5);
      addRing(x, y, 0.1, ABILITY_RADIUS * 0.6, "#ffffff", 0.35);
      addFlash(x, y, 4.5, "#ffb35a", 0.5);
      burst(x, y, "#9a8a74", 26, 2.4);
      burst(x, y, "#e2b15a", 10, 1.6);
      world.shake = Math.min(1, world.shake + 0.55);
      sfx("rock");
    }
    dirty = true;
  }

  function castAbility(fx: number, fy: number) {
    aiming = false;
    if (phase !== "combat" || paused || abilityCd > 0) {
      flush();
      return;
    }
    abilityCd = ABILITY_COOLDOWN;
    abilityShown = Math.ceil(abilityCd);
    world.strikes.push({ x: fx, y: fy, t: ABILITY_DELAY, max: ABILITY_DELAY });
    flush();
  }

  function saveRun() {
    if (phase !== "prep" || typeof localStorage === "undefined") return;
    if (waveIndex === 0 && world.towers.length === 0) return;
    const run: SavedRun = {
      v: 1,
      map: runMap,
      difficulty: runDifficulty,
      endless,
      cheated,
      wave: waveIndex,
      gold,
      lives,
      cleared,
      killed,
      leaked,
      abilityCd,
      towers: world.towers.map((tower) => ({
        kind: tower.kind,
        col: tower.col,
        row: tower.row,
        dmgRank: tower.dmgRank,
        rateRank: tower.rateRank,
        spent: tower.spent,
        target: tower.target,
        spec: tower.spec,
      })),
    };
    savedRun = run;
    try {
      localStorage.setItem(RUN_KEY, JSON.stringify(run));
    } catch {
      /* private mode */
    }
  }

  function clearRun() {
    savedRun = null;
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(RUN_KEY);
    } catch {
      /* private mode */
    }
  }

  function readRun(): SavedRun | null {
    try {
      const raw = localStorage.getItem(RUN_KEY);
      if (!raw) return null;
      const r = JSON.parse(raw) as Partial<SavedRun>;
      if (r.v !== 1 || !r.map || !(r.map in MAPS) || !r.difficulty || !(r.difficulty in DIFFICULTIES)) return null;
      const num = (value: unknown, fallback = 0) =>
        typeof value === "number" && Number.isFinite(value) ? value : fallback;
      const map = getMap(r.map);
      const seen = new Set<string>();
      const towers: SavedRun["towers"] = [];
      for (const t of Array.isArray(r.towers) ? r.towers : []) {
        if (!t || typeof t.kind !== "string" || !(t.kind in TOWERS)) continue;
        const col = num(t.col, -1);
        const row = num(t.row, -1);
        const key = `${col},${row}`;
        if (!isInside(col, row) || isRoad(map, col, row) || seen.has(key)) continue;
        seen.add(key);
        towers.push({
          kind: t.kind,
          col,
          row,
          dmgRank: Math.max(0, Math.min(MAX_RANK, num(t.dmgRank))),
          rateRank: Math.max(0, Math.min(MAX_RANK, num(t.rateRank))),
          spent: Math.max(0, num(t.spent)),
          target: ["first", "last", "close", "strong"].includes(t.target) ? t.target : "first",
          spec: SPECS[t.kind].some((item) => item.id === t.spec) ? (t.spec as SpecId) : null,
        });
      }
      return {
        v: 1,
        map: r.map,
        difficulty: r.difficulty,
        endless: r.endless === true,
        cheated: r.cheated === true,
        wave: Math.max(0, Math.floor(num(r.wave))),
        gold: Math.max(0, num(r.gold)),
        lives: Math.max(1, num(r.lives, 1)),
        cleared: Math.max(0, num(r.cleared)),
        killed: Math.max(0, num(r.killed)),
        leaked: Math.max(0, num(r.leaked)),
        abilityCd: Math.max(0, Math.min(ABILITY_COOLDOWN, num(r.abilityCd))),
        towers,
      };
    } catch {
      return null;
    }
  }

  function fire(tower: Tower, target: Creep) {
    const def = TOWERS[tower.kind];
    const stats = statsOf(tower);
    tower.cooldown += 1 / stats.rate;
    tower.recoil = 1;
    const sx = tower.col + 0.5;
    const sy = tower.row + 0.5;
    addFlash(sx + Math.cos(tower.angle) * 0.45, sy + Math.sin(tower.angle) * 0.45, 0.9, def.shot, 0.12);
    if (stats.chain > 0) {
      zap(tower, target, stats);
      sfx(tower.kind);
      return;
    }
    if (stats.line) {
      beam(tower, target, stats);
      sfx(tower.kind);
      return;
    }
    const targets = stats.targets > 1 ? pickTargets(tower, stats.targets) : [target];
    for (const victim of targets.length ? targets : [target]) {
      world.shots.push({
        x: sx,
        y: sy,
        aimX: victim.x,
        aimY: victim.y,
        speed: def.shotSpeed,
        damage: stats.damage,
        splash: stats.splash,
        slow: stats.slow,
        slowTime: stats.slowTime,
        pierce: stats.pierce,
        hitsFlying: stats.hitsFlying,
        color: def.shot,
        kind: tower.kind,
        targetId: victim.id,
        life: 2.4,
        alive: true,
        stun: stats.stun,
        brittle: stats.brittle,
        burn: stats.burn,
      });
    }
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
    if (phase === "combat" && abilityCd > 0) {
      abilityCd = Math.max(0, abilityCd - dt);
      const shown = Math.ceil(abilityCd);
      if (shown !== abilityShown) {
        abilityShown = shown;
        dirty = true;
      }
    }
    updateStrikes(dt);
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
      if (enemy.brittleT > 0) enemy.brittleT = Math.max(0, enemy.brittleT - dt);
      if (enemy.stun > 0) enemy.stun = Math.max(0, enemy.stun - dt);
      const mult = enemy.stun > 0 ? 0 : enemy.slowT > 0 ? enemy.slow : 1;
      let left = enemy.speed * mult * dt;
      enemy.vx = 0;
      enemy.vy = 0;
      const points = world.map.routes[enemy.route]!;
      while (left > 0 && enemy.alive) {
        const wp = points[enemy.wpi];
        if (!wp) {
          leakEnemy(enemy);
          break;
        }
        const dx = wp.x - enemy.x;
        const dy = wp.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.0001) {
          enemy.wpi++;
          if (enemy.wpi >= points.length) leakEnemy(enemy);
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
          if (enemy.wpi >= points.length) {
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

    healPulse(dt);
    summonPulse(dt);
    updateFires(dt);

    if (phase !== "combat") {
      decayFx(dt);
      syncCombat();
      return;
    }

    for (const tower of world.towers) {
      if (TOWERS[tower.kind].aura > 0) continue;
      tower.cooldown -= dt;
      if (tower.recoil > 0) tower.recoil = Math.max(0, tower.recoil - dt * 3.2);
      const target = pickTargets(tower, 1)[0] ?? null;
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
    if (phase !== "combat") {
      for (const fire of world.fires) fire.life -= dt * 2;
      world.fires = world.fires.filter((fire) => fire.life > 0);
    }
    for (const item of world.bolts) item.life -= dt;
    if (world.bolts.some((item) => item.life <= 0)) world.bolts = world.bolts.filter((item) => item.life > 0);
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
    if (!isInside(col, row) || isRoad(world.map, col, row)) {
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
      spec: null,
      buff: NO_BUFF,
      range: def.range,
    };
    world.towers.push(tower);
    occ.set(key, tower.id);
    refreshTowers();
    selectedId = tower.id;
    burst(col + 0.5, row + 0.5, "#e2b15a", 8, 1.1);
    sfx("place");
    banner = def.name;
    bannerT = 1.4;
    saveRun();
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
      savedRun = readRun();
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) {
          if (savedRun) flush();
          return;
        }
        const parsed = JSON.parse(raw) as {
          v?: number;
          bestWave?: number;
          wins?: unknown;
          best?: unknown;
          difficulty?: unknown;
          map?: unknown;
        };
        if (parsed.v === 3) {
          best = readPerMap(parsed.best);
          winsBy = readPerMap(parsed.wins);
          if (typeof parsed.map === "string" && parsed.map in MAPS) mapId = parsed.map as MapId;
        } else if (parsed.v === 2) {
          // v2 знал только одну карту — нынешнюю «Пепельную тропу».
          best.ash = readPer(parsed.best);
          winsBy.ash = readPer(parsed.wins);
        } else {
          // v1 хранил один рекорд — это был обычный режим.
          if (typeof parsed.bestWave === "number") best.ash.normal = parsed.bestWave;
          if (typeof parsed.wins === "number") winsBy.ash.normal = parsed.wins;
        }
        if ((parsed.v === 2 || parsed.v === 3) && typeof parsed.difficulty === "string" && parsed.difficulty in DIFFICULTIES) {
          difficulty = parsed.difficulty as Difficulty;
        }
        if (phase === "menu") previewMap();
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
      if (phase === "menu") previewMap();
      persist();
      flush();
    },
    toggleAim() {
      audio.unlock();
      if (aiming) {
        aiming = false;
        flush();
        return;
      }
      if (phase !== "combat") {
        say("Обвал падает только в бою");
        return;
      }
      if (abilityCd > 0) {
        sfx("deny");
        say(`Обвал будет готов через ${Math.ceil(abilityCd)} с`);
        return;
      }
      aiming = true;
      build = null;
      selectedId = 0;
      banner = "Куда уронить?";
      bannerT = 2.5;
      flush();
    },
    continueRun() {
      if (phase !== "menu" || !savedRun) return;
      audio.unlock();
      const run = savedRun;
      mapId = run.map;
      difficulty = run.difficulty;
      resetBoard();
      endless = run.endless;
      waveIndex = endless ? run.wave : Math.min(run.wave, WAVES.length - 1);
      cheated = run.cheated || cheat;
      gold = run.gold;
      lives = run.lives;
      cleared = run.cleared;
      killed = run.killed;
      leaked = run.leaked;
      abilityCd = run.abilityCd;
      abilityShown = Math.ceil(abilityCd);
      for (const saved of run.towers) {
        const tower: Tower = {
          id: nextId++,
          kind: saved.kind,
          col: saved.col,
          row: saved.row,
          dmgRank: saved.dmgRank,
          rateRank: saved.rateRank,
          spent: saved.spent,
          cooldown: Math.random() * 0.25,
          target: saved.target,
          angle: -Math.PI / 2,
          recoil: 0,
          born: world.anim - 10,
          spec: saved.spec,
          buff: NO_BUFF,
          range: TOWERS[saved.kind].range,
        };
        world.towers.push(tower);
        occ.set(`${tower.col},${tower.row}`, tower.id);
      }
      refreshTowers();
      phase = "prep";
      prepLeft = null;
      banner = "Димон вернулся на стену";
      bannerT = 3;
      persist();
      flush();
    },
    setMap(next) {
      if (phase !== "menu" && phase !== "victory" && phase !== "defeat") return;
      if (next === mapId) return;
      mapId = next;
      if (phase === "menu") previewMap();
      persist();
      flush();
    },
    continueEndless() {
      if (phase !== "victory") return;
      audio.unlock();
      endless = true;
      waveIndex += 1;
      phase = "prep";
      prepLeft = PREP_SECONDS;
      prepShown = PREP_SECONDS;
      banner = "Ночь не кончилась";
      bannerT = 3;
      saveRun();
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
      aiming = false;
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
      aiming = false;
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
      if (TOWERS[tower.kind].aura > 0) return;
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
      refreshTowers();
      burst(tower.col + 0.5, tower.row + 0.5, "#e2b15a", 7, 1);
      sfx("upgrade");
      saveRun();
      flush();
    },
    specialize(spec) {
      const tower = world.towers.find((item) => item.id === selectedId);
      if (!tower || tower.spec) return;
      if (!SPECS[tower.kind].some((item) => item.id === spec)) return;
      if (tower.dmgRank + tower.rateRank < specNeed(tower.kind)) {
        sfx("deny");
        say(`Мастерство откроется после ${specNeed(tower.kind)} улучшений`);
        return;
      }
      const cost = specCost(tower.kind);
      if (!canPay(cost)) {
        sfx("deny");
        say("Не хватает золота");
        return;
      }
      pay(cost);
      tower.spent += cost;
      tower.spec = spec;
      refreshTowers();
      const def = SPEC_BY_ID[spec];
      burst(tower.col + 0.5, tower.row + 0.5, def.color, 14, 1.4);
      addRing(tower.col + 0.5, tower.row + 0.5, 0.2, 1.1, def.color, 0.5);
      sfx("spec");
      banner = `${TOWERS[tower.kind].name}: ${def.name}`;
      bannerT = 1.8;
      saveRun();
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
      refreshTowers();
      selectedId = 0;
      float(tower.col + 0.5, tower.row + 0.3, `+${refund}`, "#e2b15a");
      sfx("coin");
      saveRun();
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
    pointer(col, row, type, fx = col + 0.5, fy = row + 0.5) {
      if (type === "leave" || !isInside(col, row)) {
        world.hoverCol = -1;
        world.hoverRow = -1;
        world.hoverFx = -1;
        world.hoverFy = -1;
        return;
      }
      world.hoverCol = col;
      world.hoverRow = row;
      world.hoverFx = fx;
      world.hoverFy = fy;
      if (type !== "down") return;
      audio.unlock();
      if (phase === "menu" || phase === "victory" || phase === "defeat") return;
      if (aiming) {
        castAbility(fx, fy);
        return;
      }
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
