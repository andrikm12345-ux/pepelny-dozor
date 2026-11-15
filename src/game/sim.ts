import {
  ABILITY_COOLDOWN,
  ABILITY_DELAY,
  ABILITY_RADIUS,
  AFFIX_ORDER,
  BANNER_MAX,
  BLINK_AT,
  BLINK_DIST,
  BRITTLE_TIME,
  BURN_TIME,
  CHAIN_REACH,
  COLS,
  DASH_MULT,
  DASH_TIME,
  DIFFICULTIES,
  ELITE_BLAST_RADIUS,
  ELITE_BLAST_SILENCE,
  ELITE_GOLD,
  ELITE_REGEN,
  ELITE_SWIFT,
  ELITE_TOUGH,
  ENEMIES,
  FREEZE_BOSS,
  FREEZE_BRITTLE,
  FREEZE_COOLDOWN,
  FREEZE_TIME,
  HASTE_MULT,
  HASTE_RADIUS,
  HEAL_EVERY,
  HEAL_FRACTION,
  HEAL_RADIUS,
  MAX_RANK,
  NO_BUFF,
  PERKS,
  PERK_AFTERSHOCK,
  PERK_AVALANCHE,
  PERK_DISCOUNT,
  PERK_EMBER_SPLASH,
  PERK_EVERY,
  PERK_FLETCHER,
  PERK_FREEZE_TIME,
  PERK_FURY,
  PERK_FUSE,
  PERK_GOLD,
  PERK_LANTERN_SIGHT,
  PERK_LANTERN_SLOW,
  PERK_LIVES,
  PERK_ORDER,
  PERK_RALLY_TIME,
  PERK_STORM_TARGETS,
  PREP_SECONDS,
  RAGE_BOSS,
  RAGE_ELITE,
  RAGE_KILL,
  RAGE_MINION,
  RALLY_COOLDOWN,
  RALLY_DMG,
  RALLY_RATE,
  RALLY_TIME,
  REVEAL_TIME,
  ROAR_AT,
  ROAR_DASH,
  ROAR_RADIUS,
  ROAR_RUNNERS,
  ROAR_SILENCE,
  ROWS,
  RUBBLE_SLOW,
  RUBBLE_TIME,
  SELL_RATIO,
  SHATTER_FRACTION,
  SHATTER_RADIUS,
  SHELL_ARMOR,
  SHELL_EVERY,
  SHELL_SPEED,
  SHELL_TIME,
  SILENCE_EVERY,
  SILENCE_RANGE,
  SILENCE_TIME,
  SPECS,
  SPEC_BY_ID,
  STORM_COOLDOWN,
  STORM_STUN,
  STORM_TARGETS,
  TOWERS,
  TOWER_ORDER,
  MAPS,
  MAP_ORDER,
  WAVES,
  WRATH_FALL,
  WRATH_METEORS,
  WRATH_NEED,
  WRATH_RADIUS,
  WRATH_TIME,
  abilityDamage,
  eliteChance,
  gateOf,
  mapHp,
  getMap,
  isInside,
  isRoad,
  specCost,
  specNeed,
  stormDamage,
  towerStats,
  upgradeCost,
  wavePreview,
  waveScale,
  waveSpec,
  wrathDamage,
  type AffixId,
  type Buff,
  type Difficulty,
  type EnemyKind,
  type GameMap,
  type MapId,
  type PerkId,
  type SpecId,
  type TargetMode,
  type TowerKind,
  type WaveEntry,
} from "./balance";
import { createAudio, type SfxName } from "./audio";
import { EVENTS, EVENT_ORDER, type EventId } from "./events";

const SAVE_KEY = "pepelny-dozor-v1";
const RUN_KEY = "pepelny-dozor-run-v1";

/** Что событие даёт на следующую волну. */
interface Bonus {
  dmg: number;
  hp: number;
  healers: number;
}

const NO_BONUS: Bonus = { dmg: 0, hp: 1, healers: 0 };

/** Дары, из которых надо выбрать один. */
export interface PerkView {
  options: Array<{ id: PerkId; name: string; blurb: string }>;
}

/** Событие, ожидающее выбора. */
export interface EventView {
  id: EventId;
  title: string;
  text: string;
  options: Array<{ label: string; hint: string; cost: number; disabled: boolean }>;
}

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
  freezeCd?: number;
  stormCd?: number;
  rallyCd?: number;
  /** Накопленный гнев. */
  rage?: number;
  /** Взятые дары. */
  perks?: PerkId[];
  /** Дар ещё не выбран: после загрузки выбор откроется снова. */
  perkDue?: boolean;
  /** Эффект события на следующую волну. */
  bonus?: Bonus;
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
  /** Секунд во льду после Заморозки. */
  iceT: number;
  /** Секунд рывка осталось (бегун после удара, Таран после рёва). */
  dashT: number;
  /** Бегун уже делал рывок. */
  dashed: boolean;
  /** Секунд в панцире (латник). */
  shellT: number;
  /** Секунд до следующего панциря. */
  shellCd: number;
  /** Огонёк уже мерцал. */
  blinked: boolean;
  /** Секунд до следующего глушения башни (глушитель). */
  castT: number;
  /** Секунд Тень видна башням после попадания. */
  reveal: number;
  /** Тень сейчас не видна башням. */
  hidden: boolean;
  /** Идёт быстрее под горном. */
  haste: boolean;
  /** Свойство элитной твари. */
  elite: AffixId | null;
  /** Сколько раз Таран уже ревел. */
  roars: number;
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
  /** Секунд башня заглушена и не стреляет. */
  silenceT: number;
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
  radius: number;
  /** Доля урона: второй удар «Двойного удара» слабее. */
  power: number;
}

/** Завал после Обвала: наземные идут медленнее. */
export interface Rubble {
  x: number;
  y: number;
  radius: number;
  life: number;
  max: number;
}

/** Метеор Гнева Димона, который ещё летит. */
export interface Meteor {
  x: number;
  y: number;
  t: number;
  max: number;
  radius: number;
}

/** Останки твари: спрайт, который рассыпается в пепел. */
export interface Corpse {
  x: number;
  y: number;
  kind: EnemyKind;
  scale: number;
  flip: boolean;
  flying: boolean;
  color: string;
  life: number;
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
  rubble: Rubble[];
  meteors: Meteor[];
  corpses: Corpse[];
  /** Секунд до конца вспышки Заморозки — для холодного света на поле. */
  freezeT: number;
  /** Секунд до конца Набата: башни бьют чаще и сильнее. */
  rallyT: number;
  /** Секунд до конца Гнева Димона. */
  wrathT: number;
  /** Секунд до конца вспышки Грозы. */
  stormT: number;
  /** Секунд замедления после гибели Тарана. */
  slowmo: number;
  /** Радиус Обвала с учётом даров — для прицела. */
  aimRadius: number;
  /** Жизни и их начальное число — для света врат. */
  lives: number;
  livesMax: number;
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
  /** Секунд до готовности Заморозки; 0 — можно жать. */
  freezeLeft: number;
  /** Секунд до готовности Грозы и Набата. */
  stormLeft: number;
  rallyLeft: number;
  /** Полная перезарядка каждой способности — для кольца на кнопке. */
  cooldowns: { rock: number; storm: number; freeze: number; rally: number };
  /** Набат гудит прямо сейчас. */
  rallyOn: boolean;
  /** Гнев Димона: накоплено и сколько нужно. */
  rage: number;
  rageNeed: number;
  /** Огненный дождь идёт прямо сейчас. */
  wrathOn: boolean;
  /** Выбор дара, который ждёт решения. */
  perk: PerkView | null;
  /** Взятые дары. */
  perks: Array<{ id: PerkId; name: string; blurb: string }>;
  /** Цена каждой башни с учётом даров. */
  towerCost: Record<TowerKind, number>;
  /** «Всё на максимум»: сколько улучшений ещё можно купить и сколько они стоят вместе. */
  maxAll: { steps: number; cost: number };
  /** Кто прорвался к вратам за забег: по видам, от частых к редким. */
  leakedKinds: Array<{ kind: EnemyKind; name: string; count: number }>;
  event: EventView | null;
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
  freeze(): void;
  storm(): void;
  rally(): void;
  wrath(): void;
  choosePerk(index: number): void;
  chooseEvent(index: 0 | 1): void;
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
  pointer(col: number, row: number, type: "move" | "down" | "drag" | "leave", fx?: number, fy?: number): void;
  upgradeAll(): void;
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
  const leakedBy = new Map<EnemyKind, number>();
  let best = perMap();
  let winsBy = perMap();
  let spawnCount = 0;
  let abilityCd = 0;
  let abilityShown = 0;
  let freezeCd = 0;
  let freezeShown = 0;
  let stormCd = 0;
  let stormShown = 0;
  let rallyCd = 0;
  let rallyShown = 0;
  let rage = 0;
  let rageShown = 0;
  const perks = new Set<PerkId>();
  let perkOptions: PerkId[] | null = null;
  /** Задержки молний Грозы, которые ещё не ударили, и кого она уже била. */
  let skyQueue: number[] = [];
  const skyHit = new Set<number>();
  let meteorsLeft = 0;
  let meteorGap = 0;
  let eventId: EventId | null = null;
  let lastEvent: EventId | null = null;
  let bonus: Bonus = NO_BONUS;
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
    rubble: [],
    meteors: [],
    corpses: [],
    freezeT: 0,
    rallyT: 0,
    wrathT: 0,
    stormT: 0,
    slowmo: 0,
    aimRadius: ABILITY_RADIUS,
    lives: DIFFICULTIES[difficulty].lives,
    livesMax: DIFFICULTIES[difficulty].lives,
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

  function has(id: PerkId) {
    return perks.has(id);
  }

  /** Цена с учётом дара «Свой кузнец». */
  function price(base: number) {
    return has("discount") ? Math.round(base * PERK_DISCOUNT) : base;
  }

  function rockCooldown() {
    return ABILITY_COOLDOWN * (has("fuse") ? PERK_FUSE : 1);
  }

  function stormCooldown() {
    return STORM_COOLDOWN * (has("fuse") ? PERK_FUSE : 1);
  }

  function rockRadius() {
    return ABILITY_RADIUS * (has("avalanche") ? PERK_AVALANCHE : 1);
  }

  function statsOf(tower: Tower) {
    const st = towerStats(tower.kind, tower.dmgRank, tower.rateRank, tower.spec, tower.buff);
    if (has("fletcher") && (tower.kind === "archer" || tower.kind === "ballista")) st.damage *= PERK_FLETCHER;
    if (has("wires")) {
      if (st.chain > 0) st.chain += 1;
      if (tower.kind === "ember") st.splash *= PERK_EMBER_SPLASH;
    }
    if (has("lantern") && tower.kind === "frost") st.slow *= PERK_LANTERN_SLOW;
    return st;
  }

  /** Все улучшения урона и скорости, которых башням ещё не хватает, от дешёвых к дорогим. */
  function upgradeSteps() {
    const steps: Array<{ tower: Tower; track: "dmg" | "rate"; cost: number }> = [];
    for (const tower of world.towers) {
      const def = TOWERS[tower.kind];
      if (def.aura > 0) continue;
      for (const track of ["dmg", "rate"] as const) {
        const start = track === "dmg" ? tower.dmgRank : tower.rateRank;
        for (let rank = start; rank < MAX_RANK; rank++) {
          steps.push({ tower, track, cost: price(upgradeCost(def.cost, rank)) });
        }
      }
    }
    return steps.sort((a, b) => a.cost - b.cost);
  }

  function maxAllPlan() {
    const steps = upgradeSteps();
    return { steps: steps.length, cost: steps.reduce((sum, step) => sum + step.cost, 0) };
  }

  function perkView(): PerkView | null {
    if (!perkOptions) return null;
    return { options: perkOptions.map((id) => ({ id, name: PERKS[id].name, blurb: PERKS[id].blurb })) };
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

  function eventView(): EventView | null {
    if (!eventId) return null;
    const def = EVENTS[eventId];
    return {
      id: def.id,
      title: def.title,
      text: def.text,
      options: def.options.map((option, index) => ({
        label: option.label,
        hint: option.hint,
        cost: option.cost,
        disabled:
          (option.cost > 0 && !cheat && gold < option.cost) || (def.id === "well" && index === 0 && lives <= 2),
      })),
    };
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
        dmgCost: def.aura > 0 || tower.dmgRank >= MAX_RANK ? null : price(upgradeCost(def.cost, tower.dmgRank)),
        rateCost: def.aura > 0 || tower.rateRank >= MAX_RANK ? null : price(upgradeCost(def.cost, tower.rateRank)),
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
        specCost: price(specCost(tower.kind)),
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
      freezeLeft: Math.ceil(freezeCd),
      stormLeft: Math.ceil(stormCd),
      rallyLeft: Math.ceil(rallyCd),
      cooldowns: { rock: rockCooldown(), storm: stormCooldown(), freeze: FREEZE_COOLDOWN, rally: RALLY_COOLDOWN },
      rallyOn: world.rallyT > 0,
      rage: Math.floor(rage),
      rageNeed: WRATH_NEED,
      wrathOn: world.wrathT > 0,
      perk: perkView(),
      perks: [...perks].map((id) => ({ id, name: PERKS[id].name, blurb: PERKS[id].blurb })),
      maxAll: maxAllPlan(),
      towerCost: Object.fromEntries(TOWER_ORDER.map((kind) => [kind, price(TOWERS[kind].cost)])) as Record<TowerKind, number>,
      leakedKinds: [...leakedBy.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([kind, count]) => ({ kind, name: ENEMIES[kind].name, count })),
      event: eventView(),
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
    world.aimRadius = rockRadius();
    world.lives = lives;
    world.livesMax = DIFFICULTIES[phase === "menu" ? difficulty : runDifficulty].lives;
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

  /** Пыль у земли: серые лёгкие хлопья, оседают. */
  function dust(x: number, y: number, count: number, spread = 0.3) {
    for (let i = 0; i < count; i++) {
      world.particles.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread * 0.5,
        vx: (Math.random() - 0.5) * 0.7,
        vy: -0.1 - Math.random() * 0.35,
        life: 0.35 + Math.random() * 0.3,
        max: 0.65,
        color: "#8a7f70",
        size: 0.05 + Math.random() * 0.06,
      });
    }
    if (world.particles.length > 280) world.particles.splice(0, world.particles.length - 280);
  }

  /** Столб искр вверх: улучшение, мастерство, продажа. */
  function pillar(x: number, y: number, color: string, count = 14) {
    for (let i = 0; i < count; i++) {
      world.particles.push({
        x: x + (Math.random() - 0.5) * 0.5,
        y: y + 0.2,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -(1.2 + Math.random() * 1.6),
        life: 0.5 + Math.random() * 0.4,
        max: 0.9,
        color,
        size: 0.04 + Math.random() * 0.06,
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

  /** Гнев копится только в бою и не во время самого огненного дождя. */
  function addRage(amount: number) {
    if (phase !== "combat" || world.wrathT > 0) return;
    const was = rage;
    rage = Math.min(WRATH_NEED, rage + amount * (has("fury") ? PERK_FURY : 1));
    if (was < WRATH_NEED && rage >= WRATH_NEED) {
      banner = "Гнев Димона готов";
      bannerT = 2.2;
      sfx("spec");
    }
  }

  /** Заглушить башню: она не стреляет. Набат не даёт глушить. */
  function silenceTower(tower: Tower, time: number) {
    if (world.rallyT > 0 || TOWERS[tower.kind].aura > 0) return false;
    if (time <= tower.silenceT) return false;
    tower.silenceT = time;
    addRing(tower.col + 0.5, tower.row + 0.5, 0.15, 0.7, "#c46bff", 0.4);
    return true;
  }

  function silenceAround(x: number, y: number, radius: number, time: number) {
    let n = 0;
    for (const tower of world.towers) {
      const dx = tower.col + 0.5 - x;
      const dy = tower.row + 0.5 - y;
      if (dx * dx + dy * dy <= radius * radius && silenceTower(tower, time)) n++;
    }
    return n;
  }

  /** Осколки: замороженная тварь разлетается и ранит соседей. */
  function shatter(enemy: Creep) {
    const dmg = enemy.maxHp * SHATTER_FRACTION;
    const r2 = SHATTER_RADIUS * SHATTER_RADIUS;
    addRing(enemy.x, enemy.y, 0.1, SHATTER_RADIUS, "#cfe7f0", 0.4);
    burst(enemy.x, enemy.y, "#dff3ff", 10, 2);
    sfx("shatter");
    for (const other of world.enemies) {
      if (!other.alive) continue;
      const dx = other.x - enemy.x;
      const dy = other.y - enemy.y;
      if (dx * dx + dy * dy > r2) continue;
      hurtEnemy(other, plainShot("frost", dmg, enemy.x, enemy.y, "#cfe7f0", { pierce: true }));
    }
  }

  function killEnemy(enemy: Creep) {
    if (!enemy.alive) return;
    enemy.alive = false;
    const reward = has("marauder") ? Math.round(enemy.gold * PERK_GOLD) : enemy.gold;
    gold += reward;
    killed++;
    addRage(enemy.kind === "boss" ? RAGE_BOSS : enemy.ownerId ? RAGE_MINION : enemy.elite ? RAGE_ELITE : RAGE_KILL);
    float(enemy.x, enemy.y - 0.2, `+${reward}`, "#e2b15a");
    burst(enemy.x, enemy.y, enemy.color, enemy.kind === "boss" ? 18 : 8, enemy.kind === "boss" ? 2.2 : 1.3);
    addDecal(enemy.x, enemy.y, enemy.scale);
    addFlash(enemy.x, enemy.y, 1.3, enemy.color, 0.3);
    world.corpses.push({
      x: enemy.x,
      y: enemy.y,
      kind: enemy.kind,
      scale: enemy.scale,
      flip: enemy.vx < -0.2,
      flying: enemy.flying,
      color: enemy.color,
      life: 0.5,
      max: 0.5,
    });
    if (world.corpses.length > 40) world.corpses.shift();
    if (enemy.kind === "boss") {
      world.shake = Math.min(1, world.shake + 0.65);
      world.slowmo = 0.9;
      addRing(enemy.x, enemy.y, 0.3, 3.2, "#e2b15a", 0.8);
      addFlash(enemy.x, enemy.y, 4, "#ffb35a", 0.7);
      sfx("boom");
    }
    sfx("coin");
    dirty = true;
    if (enemy.iceT > 0) shatter(enemy);
    if (enemy.elite === "volatile") {
      silenceAround(enemy.x, enemy.y, ELITE_BLAST_RADIUS, ELITE_BLAST_SILENCE);
      addRing(enemy.x, enemy.y, 0.2, ELITE_BLAST_RADIUS, "#c46bff", 0.5);
      addFlash(enemy.x, enemy.y, 2.4, "#c46bff", 0.4);
      sfx("silence");
    }
  }

  function leakEnemy(enemy: Creep) {
    if (!enemy.alive) return;
    enemy.alive = false;
    leaked++;
    leakedBy.set(enemy.kind, (leakedBy.get(enemy.kind) ?? 0) + 1);
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
    if (!enemy.alive) return;
    // любое попадание выдаёт Тень башням
    if (enemy.kind === "shade") enemy.reveal = REVEAL_TIME;
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
    if (enemy.shellT > 0 && !shot.pierce) {
      amount *= SHELL_ARMOR;
      addRing(enemy.x, enemy.y, 0.25, 0.5, "#c9d2d6", 0.2);
      sfx("shield");
    }
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
    if (enemy.hp <= 0) {
      killEnemy(enemy);
      return;
    }
    // умения, которые срабатывают от удара
    if (enemy.kind === "runner" && !enemy.dashed) {
      enemy.dashed = true;
      enemy.dashT = DASH_TIME;
      addRing(enemy.x, enemy.y, 0.1, 0.5, "#fff3d6", 0.25);
      sfx("dash");
    } else if (enemy.kind === "wisp" && !enemy.blinked && enemy.hp <= enemy.maxHp * BLINK_AT) {
      blink(enemy);
    } else if (enemy.kind === "boss" && enemy.roars < ROAR_AT.length && enemy.hp <= enemy.maxHp * ROAR_AT[enemy.roars]!) {
      roar(enemy);
    }
  }

  /** Огонёк перескакивает вперёд по тропе. */
  function blink(enemy: Creep) {
    enemy.blinked = true;
    const fromX = enemy.x;
    const fromY = enemy.y;
    advance(enemy, BLINK_DIST);
    if (!enemy.alive) return;
    world.bolts.push({ pts: [{ x: fromX, y: fromY }, { x: enemy.x, y: enemy.y }], life: 0.3, max: 0.3, beam: "#f0d8bf" });
    if (world.bolts.length > 30) world.bolts.shift();
    addRing(fromX, fromY, 0.1, 0.6, "#f0d8bf", 0.35);
    addFlash(enemy.x, enemy.y, 1.2, "#f0d8bf", 0.3);
    sfx("blink");
  }

  /** Рёв Тарана: башни рядом глохнут, сам он делает рывок и зовёт бегунов. */
  function roar(boss: Creep) {
    boss.roars++;
    silenceAround(boss.x, boss.y, ROAR_RADIUS, ROAR_SILENCE);
    boss.dashT = ROAR_DASH;
    for (let i = 0; i < ROAR_RUNNERS; i++) {
      const minion = makeCreep("runner", boss.route, boss.x + (Math.random() - 0.5) * 0.4, boss.y + (Math.random() - 0.5) * 0.4, 0.5);
      minion.wpi = boss.wpi;
      minion.travel = boss.travel;
      minion.ownerId = boss.id;
      world.enemies.push(minion);
      byId.set(minion.id, minion);
    }
    combatTotal += ROAR_RUNNERS;
    addRing(boss.x, boss.y, 0.3, ROAR_RADIUS, "#e25b3a", 0.7);
    addRing(boss.x, boss.y, 0.2, ROAR_RADIUS * 0.6, "#ffb35a", 0.5);
    addFlash(boss.x, boss.y, 4, "#e25b3a", 0.6);
    world.shake = Math.min(1, world.shake + 0.5);
    sfx("roar");
    banner = "Таран ревёт: башни рядом оглохли";
    bannerT = 2.4;
    dirty = true;
  }

  /** Урон от огня: щит не гасит, броня действует. */
  function burnEnemy(enemy: Creep, amount: number) {
    let dmg = amount * (enemy.armor < 1 ? enemy.armor : 1);
    if (enemy.shellT > 0) dmg *= SHELL_ARMOR;
    if (enemy.kind === "shade") enemy.reveal = Math.max(enemy.reveal, 0.5);
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
    const hp = Math.round(def.hp * DIFFICULTIES[runDifficulty].hp * mapHp(MAPS[runMap].hp, waveIndex) * scale.hp * bonus.hp);
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
      iceT: 0,
      dashT: 0,
      dashed: false,
      shellT: 0,
      shellCd: kind === "husk" ? SHELL_EVERY * (0.3 + Math.random() * 0.7) : 0,
      blinked: false,
      castT: kind === "silencer" ? SILENCE_EVERY * (0.3 + Math.random() * 0.4) : 0,
      reveal: 0,
      hidden: kind === "shade",
      haste: false,
      elite: null,
      roars: 0,
    };
  }

  /** Сделать тварь элитной: случайное свойство и двойное золото. */
  function makeElite(enemy: Creep) {
    const affix = AFFIX_ORDER[Math.floor(Math.random() * AFFIX_ORDER.length)]!;
    enemy.elite = affix;
    enemy.gold *= ELITE_GOLD;
    if (affix === "swift") enemy.speed *= ELITE_SWIFT;
    if (affix === "tough") {
      enemy.hp = Math.round(enemy.hp * ELITE_TOUGH);
      enemy.maxHp = enemy.hp;
      enemy.scale *= 1.12;
    }
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
    if (kind !== "boss" && Math.random() < eliteChance(waveIndex, runDifficulty)) makeElite(enemy);
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

  /** Глушители выключают ближайшую башню, горнисты ускоряют стаю, Тени прячутся от башен. */
  function skillPulse(dt: number) {
    let drummers = false;
    for (const enemy of world.enemies) {
      enemy.haste = false;
      if (enemy.alive && enemy.kind === "drummer") drummers = true;
    }
    for (const caster of world.enemies) {
      if (!caster.alive) continue;
      if (drummers && caster.kind === "drummer") {
        const r2 = HASTE_RADIUS * HASTE_RADIUS;
        for (const other of world.enemies) {
          if (!other.alive || other === caster || other.kind === "drummer") continue;
          const dx = other.x - caster.x;
          const dy = other.y - caster.y;
          if (dx * dx + dy * dy <= r2) other.haste = true;
        }
      } else if (caster.kind === "silencer" && caster.stun <= 0) {
        caster.castT -= dt;
        if (caster.castT > 0) continue;
        let best: Tower | null = null;
        let bestD = SILENCE_RANGE * SILENCE_RANGE;
        for (const tower of world.towers) {
          if (TOWERS[tower.kind].aura > 0 || tower.silenceT > 0) continue;
          const dx = tower.col + 0.5 - caster.x;
          const dy = tower.row + 0.5 - caster.y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= bestD) {
            bestD = d2;
            best = tower;
          }
        }
        if (!best || !silenceTower(best, SILENCE_TIME)) {
          caster.castT = 0.6;
          continue;
        }
        caster.castT = SILENCE_EVERY;
        world.bolts.push({
          pts: [
            { x: caster.x, y: caster.y },
            { x: best.col + 0.5, y: best.row + 0.5 },
          ],
          life: 0.4,
          max: 0.4,
          beam: "#c46bff",
        });
        if (world.bolts.length > 30) world.bolts.shift();
        addFlash(best.col + 0.5, best.row + 0.5, 1.4, "#c46bff", 0.35);
        sfx("silence");
      } else if (caster.kind === "shade") {
        let lit = caster.reveal > 0;
        if (!lit) {
          const extra = has("lantern") ? PERK_LANTERN_SIGHT : 0;
          for (const tower of world.towers) {
            if (tower.kind !== "frost" || tower.silenceT > 0) continue;
            const dx = tower.col + 0.5 - caster.x;
            const dy = tower.row + 0.5 - caster.y;
            const reach = tower.range + extra;
            if (dx * dx + dy * dy <= reach * reach) {
              lit = true;
              break;
            }
          }
        }
        caster.hidden = !lit;
      }
    }
  }

  /** Сдвинуть тварь вдоль её тропы на dist клеток; дошла до врат — пропущена. */
  function advance(enemy: Creep, dist: number) {
    let left = dist;
    const points = world.map.routes[enemy.route]!;
    while (left > 0 && enemy.alive) {
      const wp = points[enemy.wpi];
      if (!wp) {
        leakEnemy(enemy);
        break;
      }
      const dx = wp.x - enemy.x;
      const dy = wp.y - enemy.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.0001) {
        enemy.wpi++;
        if (enemy.wpi >= points.length) leakEnemy(enemy);
        continue;
      }
      enemy.vx = dx / d;
      enemy.vy = dy / d;
      if (d <= left + 0.0001) {
        enemy.x = wp.x;
        enemy.y = wp.y;
        enemy.travel += d;
        left -= d;
        enemy.wpi++;
        if (enemy.wpi >= points.length) {
          leakEnemy(enemy);
          break;
        }
      } else {
        enemy.x += (dx / d) * left;
        enemy.y += (dy / d) * left;
        enemy.travel += left;
        left = 0;
      }
    }
  }

  function inRubble(enemy: Creep) {
    for (const pile of world.rubble) {
      const dx = enemy.x - pile.x;
      const dy = enemy.y - pile.y;
      if (dx * dx + dy * dy <= pile.radius * pile.radius) return true;
    }
    return false;
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

  function beginWave(immediate: boolean, early = 0) {
    const spec = waveSpec(waveIndex);
    queue = [];
    let first = true;
    for (const group of spec) {
      for (let i = 0; i < group.count; i++) {
        queue.push({ kind: group.kind, gap: first ? 0.25 : group.interval });
        first = false;
      }
    }
    for (let i = 0; i < bonus.healers; i++) queue.splice(Math.min(queue.length, 2 + i * 3), 0, { kind: "healer", gap: 0.8 });
    combatTotal = queue.length;
    combatLeft = queue.length;
    spawnGap = queue[0]?.gap ?? 0;
    phase = "combat";
    for (const route of world.map.routes) {
      const first = route[0]!;
      addRing(first.x, first.y, 0.2, 2.2, "#e25b3a", 0.8);
      addRing(first.x, first.y, 0.1, 1.2, "#ffd27a", 0.6);
      addFlash(first.x, first.y, 3.4, "#e25b3a", 0.6);
      burst(first.x, first.y, "#ffb35a", 16, 2.2);
    }
    world.shake = Math.min(1, world.shake + 0.25);
    banner = early > 0 ? `+${early} золота за спешку` : "";
    bannerT = early > 0 ? 2.2 : 0;
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
      bonus = NO_BONUS;
      save();
      saveRun();
      // после каждой третьей волны — дар Димона, после остальных чётных — событие; таймер ждёт выбора
      if (cleared % PERK_EVERY === 0 && openPerks()) saveRun();
      else if (cleared % 2 === 0) openEvent();
    }
    skyQueue = [];
    skyHit.clear();
    meteorsLeft = 0;
    dirty = true;
  }

  /** Предложить три случайных дара из ещё не взятых. */
  function openPerks(): boolean {
    const pool = PERK_ORDER.filter((id) => !perks.has(id));
    if (!pool.length) return false;
    const pick: PerkId[] = [];
    while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
    perkOptions = pick;
    prepLeft = null;
    prepShown = 0;
    banner = "Дар Димона";
    bannerT = 2.5;
    sfx("perk");
    return true;
  }

  function openEvent() {
    const pool = EVENT_ORDER.filter((id) => id !== lastEvent);
    eventId = pool[Math.floor(Math.random() * pool.length)]!;
    lastEvent = eventId;
    prepLeft = null;
    prepShown = 0;
    banner = EVENTS[eventId].title;
    bannerT = 2.5;
    sfx("event");
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
    freezeCd = 0;
    freezeShown = 0;
    stormCd = 0;
    stormShown = 0;
    rallyCd = 0;
    rallyShown = 0;
    rage = 0;
    rageShown = 0;
    perks.clear();
    perkOptions = null;
    skyQueue = [];
    skyHit.clear();
    meteorsLeft = 0;
    meteorGap = 0;
    eventId = null;
    lastEvent = null;
    bonus = NO_BONUS;
    world.freezeT = 0;
    world.rallyT = 0;
    world.wrathT = 0;
    world.stormT = 0;
    world.slowmo = 0;
    aiming = false;
    world.bolts = [];
    world.fires = [];
    world.strikes = [];
    world.rubble = [];
    world.meteors = [];
    world.corpses = [];
    occ.clear();
    byId.clear();
    queue = [];
    gold = startGold();
    lives = DIFFICULTIES[difficulty].lives;
    waveIndex = 0;
    cleared = 0;
    killed = 0;
    leaked = 0;
    leakedBy.clear();
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
      if (!enemy.alive || enemy.hidden) continue;
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
        if (!enemy.alive || enemy.hidden || hit.has(enemy.id)) continue;
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
    for (const { x, y, radius, power } of landed) {
      const damage = abilityDamage(waveIndex) * power;
      const r2 = radius * radius;
      for (const enemy of world.enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.x - x;
        const dy = enemy.y - y;
        if (dx * dx + dy * dy > r2) continue;
        enemy.shield = 0;
        hurtEnemy(enemy, plainShot("ballista", damage, x, y, "#e2b15a", { pierce: true, slow: 0.4, slowTime: 2 }));
      }
      // завал: наземные в нём идут медленнее
      world.rubble.push({ x, y, radius: radius * 0.95, life: RUBBLE_TIME, max: RUBBLE_TIME });
      if (world.rubble.length > 6) world.rubble.shift();
      addRing(x, y, 0.2, radius, "#e2b15a", 0.5);
      addRing(x, y, 0.1, radius * 0.6, "#ffffff", 0.35);
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
    abilityCd = rockCooldown();
    abilityShown = Math.ceil(abilityCd);
    const radius = rockRadius();
    world.strikes.push({ x: fx, y: fy, t: ABILITY_DELAY, max: ABILITY_DELAY, radius, power: 1 });
    if (has("aftershock")) {
      world.strikes.push({ x: fx, y: fy, t: ABILITY_DELAY + 1, max: ABILITY_DELAY + 1, radius, power: PERK_AFTERSHOCK });
    }
    flush();
  }

  /** Гроза Димона: молнии по самым здоровым тварям, по одной с короткой паузой. */
  function castStorm() {
    stormCd = stormCooldown();
    stormShown = Math.ceil(stormCd);
    const n = STORM_TARGETS + (has("stormfront") ? PERK_STORM_TARGETS : 0);
    skyHit.clear();
    skyQueue = Array.from({ length: n }, (_, i) => 0.12 + i * 0.09);
    world.stormT = 0.45;
    sfx("storm");
    banner = "Гроза";
    bannerT = 1.4;
    flush();
  }

  function updateStorm(dt: number) {
    if (world.stormT > 0) world.stormT = Math.max(0, world.stormT - dt);
    if (!skyQueue.length) return;
    for (let i = 0; i < skyQueue.length; i++) skyQueue[i]! -= dt;
    while (skyQueue.length && skyQueue[0]! <= 0) {
      skyQueue.shift();
      let target: Creep | null = null;
      for (const enemy of world.enemies) {
        if (!enemy.alive || skyHit.has(enemy.id)) continue;
        if (!target || enemy.hp > target.hp) target = enemy;
      }
      if (!target) {
        skyQueue = [];
        break;
      }
      skyHit.add(target.id);
      const { x, y } = target;
      target.shield = 0;
      hurtEnemy(target, plainShot("tesla", stormDamage(waveIndex), x, y, "#8fd6ff", { pierce: true, stun: STORM_STUN }));
      world.bolts.push({
        pts: [
          { x: x + (Math.random() - 0.5) * 2.4, y: y - 9 },
          { x: x + (Math.random() - 0.5) * 0.8, y: y - 4 },
          { x, y },
        ],
        life: 0.3,
        max: 0.3,
      });
      if (world.bolts.length > 30) world.bolts.shift();
      addFlash(x, y, 2.4, "#bfe6ff", 0.3);
      addRing(x, y, 0.1, 0.9, "#bfe6ff", 0.3);
      burst(x, y, "#dff4ff", 8, 1.8);
      world.shake = Math.min(1, world.shake + 0.12);
      world.stormT = Math.max(world.stormT, 0.12);
      sfx("tesla");
      dirty = true;
    }
  }

  /** Набат Димона: башни бьют чаще и сильнее, глушение снято и не действует. */
  function castRally() {
    rallyCd = RALLY_COOLDOWN;
    rallyShown = Math.ceil(rallyCd);
    world.rallyT = RALLY_TIME + (has("longbell") ? PERK_RALLY_TIME : 0);
    for (const tower of world.towers) {
      tower.silenceT = 0;
      addRing(tower.col + 0.5, tower.row + 0.5, 0.2, 0.9, "#ffd88a", 0.5);
    }
    const gate = gateOf(world.map);
    addFlash(gate.x, gate.y, 5, "#ffd88a", 0.6);
    sfx("rally");
    banner = "Набат: башни бьют чаще";
    bannerT = 1.8;
    flush();
  }

  /** Гнев Димона: огненный дождь по тварям. */
  function castWrath() {
    rage = 0;
    rageShown = 0;
    world.wrathT = WRATH_TIME;
    meteorsLeft = WRATH_METEORS;
    meteorGap = 0.15;
    world.shake = Math.min(1, world.shake + 0.5);
    addFlash(COLS / 2, ROWS / 2, 14, "#ff7a3a", 0.8);
    sfx("wrath");
    banner = "Гнев Димона";
    bannerT = 2.2;
    flush();
  }

  /** Куда упадёт следующий метеор: в случайную тварь с упреждением, а без тварей — на тропу. */
  function meteorAim(): { x: number; y: number } {
    const alive = world.enemies.filter((enemy) => enemy.alive);
    if (alive.length) {
      const enemy = alive[Math.floor(Math.random() * alive.length)]!;
      const lead = enemy.stun > 0 ? 0 : enemy.speed * WRATH_FALL * 0.7;
      return { x: enemy.x + enemy.vx * lead, y: enemy.y + enemy.vy * lead };
    }
    const route = world.map.routes[Math.floor(Math.random() * world.map.routes.length)]!;
    const i = Math.floor(Math.random() * (route.length - 1));
    const a = route[i]!;
    const b = route[i + 1]!;
    const t = Math.random();
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function updateWrath(dt: number) {
    if (world.wrathT > 0) {
      world.wrathT = Math.max(0, world.wrathT - dt);
      if (world.wrathT === 0) dirty = true;
      meteorGap -= dt;
      while (meteorsLeft > 0 && meteorGap <= 0) {
        meteorGap += (WRATH_TIME - WRATH_FALL - 0.3) / WRATH_METEORS;
        meteorsLeft--;
        const aim = meteorAim();
        world.meteors.push({ x: aim.x, y: aim.y, t: WRATH_FALL, max: WRATH_FALL, radius: WRATH_RADIUS });
      }
    }
    if (!world.meteors.length) return;
    for (const meteor of world.meteors) meteor.t -= dt;
    const landed = world.meteors.filter((meteor) => meteor.t <= 0);
    if (!landed.length) return;
    world.meteors = world.meteors.filter((meteor) => meteor.t > 0);
    const damage = wrathDamage(waveIndex);
    for (const { x, y, radius } of landed) {
      const r2 = radius * radius;
      for (const enemy of world.enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.x - x;
        const dy = enemy.y - y;
        if (dx * dx + dy * dy > r2) continue;
        hurtEnemy(enemy, plainShot("ember", damage, x, y, "#ff7a3a", { pierce: true }));
      }
      world.fires.push({ x, y, radius: radius * 0.8, dps: damage * 0.2, life: 1.6, max: 1.6 });
      if (world.fires.length > 24) world.fires.shift();
      addRing(x, y, 0.2, radius, "#ff8a4a", 0.45);
      addFlash(x, y, 3.2, "#ff9a4a", 0.45);
      burst(x, y, "#ffb35a", 12, 2.2);
      burst(x, y, "#6b5a50", 6, 1.4);
      addDecal(x, y, 1.3);
      world.shake = Math.min(1, world.shake + 0.22);
      sfx("boom");
    }
    dirty = true;
  }

  /** Заморозка Димона: всё на поле встаёт на пару секунд и получает лишний урон. */
  function castFreeze() {
    freezeCd = FREEZE_COOLDOWN;
    freezeShown = Math.ceil(freezeCd);
    world.freezeT = 0.9;
    for (const enemy of world.enemies) {
      if (!enemy.alive) continue;
      const time = enemy.kind === "boss" ? FREEZE_BOSS : FREEZE_TIME + (has("permafrost") ? PERK_FREEZE_TIME : 0);
      if (enemy.kind === "shade") enemy.reveal = Math.max(enemy.reveal, time + 1);
      enemy.stun = Math.max(enemy.stun, time);
      enemy.iceT = Math.max(enemy.iceT, time);
      enemy.brittle = Math.max(enemy.brittleT > 0 ? enemy.brittle : 0, FREEZE_BRITTLE);
      enemy.brittleT = Math.max(enemy.brittleT, time + 1);
      addRing(enemy.x, enemy.y, 0.1, 0.7, "#cfe7f0", 0.5);
    }
    addFlash(COLS / 2, ROWS / 2, 12, "#9ec4d4", 0.6);
    world.shake = Math.min(1, world.shake + 0.2);
    sfx("freeze");
    banner = "Заморозка";
    bannerT = 1.4;
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
      freezeCd,
      stormCd,
      rallyCd,
      rage,
      perks: [...perks],
      perkDue: perkOptions !== null,
      bonus,
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
        freezeCd: Math.max(0, Math.min(FREEZE_COOLDOWN, num(r.freezeCd))),
        stormCd: Math.max(0, Math.min(STORM_COOLDOWN, num(r.stormCd))),
        rallyCd: Math.max(0, Math.min(RALLY_COOLDOWN, num(r.rallyCd))),
        rage: Math.max(0, Math.min(WRATH_NEED, num(r.rage))),
        perks: (Array.isArray(r.perks) ? r.perks : []).filter(
          (id, index, all): id is PerkId => typeof id === "string" && id in PERKS && all.indexOf(id) === index,
        ),
        perkDue: r.perkDue === true,
        bonus: {
          dmg: Math.max(0, Math.min(1, num(r.bonus?.dmg))),
          hp: Math.max(0.5, Math.min(1, num(r.bonus?.hp, 1))),
          healers: Math.max(0, Math.min(4, Math.floor(num(r.bonus?.healers)))),
        },
        towers,
      };
    } catch {
      return null;
    }
  }

  function fire(tower: Tower, target: Creep) {
    const def = TOWERS[tower.kind];
    const stats = statsOf(tower);
    stats.damage *= 1 + bonus.dmg;
    if (world.rallyT > 0) {
      stats.damage *= 1 + RALLY_DMG;
      stats.rate *= 1 + RALLY_RATE;
    }
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
    if (phase === "combat" && freezeCd > 0) {
      freezeCd = Math.max(0, freezeCd - dt);
      const shown = Math.ceil(freezeCd);
      if (shown !== freezeShown) {
        freezeShown = shown;
        dirty = true;
      }
    }
    if (phase === "combat" && stormCd > 0) {
      stormCd = Math.max(0, stormCd - dt);
      const shown = Math.ceil(stormCd);
      if (shown !== stormShown) {
        stormShown = shown;
        dirty = true;
      }
    }
    if (phase === "combat" && rallyCd > 0) {
      rallyCd = Math.max(0, rallyCd - dt);
      const shown = Math.ceil(rallyCd);
      if (shown !== rallyShown) {
        rallyShown = shown;
        dirty = true;
      }
    }
    if (world.rallyT > 0) {
      world.rallyT = Math.max(0, world.rallyT - dt);
      if (world.rallyT === 0) dirty = true;
    }
    if (Math.floor(rage) !== rageShown) {
      rageShown = Math.floor(rage);
      dirty = true;
    }
    if (world.freezeT > 0) world.freezeT = Math.max(0, world.freezeT - dt);
    updateStrikes(dt);
    updateStorm(dt);
    updateWrath(dt);
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

    skillPulse(dt);
    for (const enemy of world.enemies) {
      if (!enemy.alive) continue;
      if (enemy.slowT > 0) enemy.slowT = Math.max(0, enemy.slowT - dt);
      if (enemy.flash > 0) enemy.flash = Math.max(0, enemy.flash - dt);
      if (enemy.brittleT > 0) enemy.brittleT = Math.max(0, enemy.brittleT - dt);
      if (enemy.stun > 0) enemy.stun = Math.max(0, enemy.stun - dt);
      if (enemy.iceT > 0) enemy.iceT = Math.max(0, enemy.iceT - dt);
      if (enemy.dashT > 0) enemy.dashT = Math.max(0, enemy.dashT - dt);
      if (enemy.reveal > 0) enemy.reveal = Math.max(0, enemy.reveal - dt);
      if (enemy.kind === "husk") {
        if (enemy.shellT > 0) enemy.shellT = Math.max(0, enemy.shellT - dt);
        else if (enemy.stun <= 0) {
          enemy.shellCd -= dt;
          if (enemy.shellCd <= 0) {
            enemy.shellT = SHELL_TIME;
            enemy.shellCd = SHELL_EVERY;
            addRing(enemy.x, enemy.y, 0.5, 0.2, "#c9d2d6", 0.3);
          }
        }
      }
      if (enemy.elite === "regen" && enemy.iceT <= 0 && enemy.hp < enemy.maxHp) {
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * ELITE_REGEN * dt);
      }
      const stride = Math.floor(enemy.travel / 0.55);
      let mult = enemy.stun > 0 ? 0 : enemy.slowT > 0 ? enemy.slow : 1;
      if (mult > 0) {
        if (!enemy.flying && world.rubble.length && inRubble(enemy)) mult = Math.min(mult, RUBBLE_SLOW);
        if (enemy.shellT > 0) mult *= SHELL_SPEED;
        if (enemy.dashT > 0) mult *= DASH_MULT;
        if (enemy.haste) mult *= HASTE_MULT;
      }
      enemy.vx = 0;
      enemy.vy = 0;
      advance(enemy, enemy.speed * mult * dt);
      // на каждом шаге из-под лап поднимается пыль; летуны оставляют искры
      if (enemy.alive && Math.floor(enemy.travel / 0.55) !== stride && world.particles.length < 200) {
        if (enemy.flying) pillar(enemy.x, enemy.y + 0.1, enemy.color, 1);
        else dust(enemy.x - enemy.vx * 0.15, enemy.y + 0.28 * enemy.scale, 2, 0.2);
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
      if (tower.recoil > 0) tower.recoil = Math.max(0, tower.recoil - dt * 3.2);
      if (TOWERS[tower.kind].aura > 0) continue;
      // заглушённая башня не стреляет и не копит выстрел
      if (tower.silenceT > 0) {
        tower.silenceT = Math.max(0, tower.silenceT - dt);
        continue;
      }
      const target = pickTargets(tower, 1)[0] ?? null;
      if (!target) {
        // без цели выстрелы не копятся: первая тварь получает один, а не очередь
        tower.cooldown = Math.max(0, tower.cooldown - dt);
        continue;
      }
      tower.cooldown -= dt;
      const cx = tower.col + 0.5;
      const cy = tower.row + 0.5;
      const aim = Math.atan2(target.y - cy, target.x - cx);
      tower.angle = dampAngle(tower.angle, aim, dt);
      if (tower.cooldown <= 0) fire(tower, target);
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
    for (const item of world.rubble) item.life -= dt;
    if (world.rubble.some((item) => item.life <= 0)) world.rubble = world.rubble.filter((item) => item.life > 0);
    for (const item of world.corpses) item.life -= dt;
    if (world.corpses.some((item) => item.life <= 0)) world.corpses = world.corpses.filter((item) => item.life > 0);
    for (const item of world.rings) item.life -= dt;
    for (const item of world.decals) item.life -= dt;
    for (const item of world.flashes) item.life -= dt;
    if (world.rings.some((item) => item.life <= 0)) world.rings = world.rings.filter((item) => item.life > 0);
    if (world.decals.some((item) => item.life <= 0)) world.decals = world.decals.filter((item) => item.life > 0);
    if (world.flashes.some((item) => item.life <= 0)) world.flashes = world.flashes.filter((item) => item.life > 0);
  }

  /** quiet — протяжка пальцем: занятые клетки и тропу молча пропускаем, а не ругаемся на каждой. */
  function place(col: number, row: number, quiet = false) {
    if (phase === "menu" || phase === "victory" || phase === "defeat") return;
    if (!build) return;
    if (!isInside(col, row) || isRoad(world.map, col, row)) {
      if (quiet) return;
      sfx("deny");
      say("Сюда нельзя — это тропа");
      return;
    }
    const key = `${col},${row}`;
    if (occ.has(key)) {
      if (quiet) return;
      sfx("deny");
      say("Клетка занята");
      return;
    }
    const def = TOWERS[build];
    const cost = price(def.cost);
    if (!canPay(cost)) {
      if (quiet) {
        if (banner !== "Не хватает золота" || bannerT <= 0) {
          sfx("deny");
          say("Не хватает золота");
        }
        return;
      }
      sfx("deny");
      say("Не хватает золота");
      return;
    }
    pay(cost);
    const tower: Tower = {
      id: nextId++,
      kind: build,
      col,
      row,
      dmgRank: 0,
      rateRank: 0,
      spent: cost,
      cooldown: Math.random() * 0.25,
      target: "first",
      angle: -Math.PI / 2,
      recoil: 0,
      born: world.anim,
      spec: null,
      buff: NO_BUFF,
      range: def.range,
      silenceT: 0,
    };
    world.towers.push(tower);
    occ.set(key, tower.id);
    refreshTowers();
    selectedId = tower.id;
    burst(col + 0.5, row + 0.5, "#e2b15a", 8, 1.1);
    dust(col + 0.5, row + 0.85, 9, 0.7);
    addRing(col + 0.5, row + 0.8, 0.1, 0.9, "#c9b99a", 0.4);
    pillar(col + 0.5, row + 0.5, "#ffd98a", quiet ? 4 : 10);
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
      freezeCd = run.freezeCd ?? 0;
      freezeShown = Math.ceil(freezeCd);
      stormCd = run.stormCd ?? 0;
      stormShown = Math.ceil(stormCd);
      rallyCd = run.rallyCd ?? 0;
      rallyShown = Math.ceil(rallyCd);
      rage = run.rage ?? 0;
      rageShown = Math.floor(rage);
      for (const id of run.perks ?? []) perks.add(id);
      bonus = run.bonus ?? NO_BONUS;
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
          silenceT: 0,
        };
        world.towers.push(tower);
        occ.set(`${tower.col},${tower.row}`, tower.id);
      }
      refreshTowers();
      phase = "prep";
      prepLeft = null;
      banner = "Димон вернулся на стену";
      bannerT = 3;
      if (run.perkDue) openPerks();
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
      if (cleared % PERK_EVERY === 0) openPerks();
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
      if (!canPay(price(def.cost))) {
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
      const cost = price(upgradeCost(TOWERS[tower.kind].cost, rank));
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
      pillar(tower.col + 0.5, tower.row + 0.5, track === "dmg" ? "#ffd98a" : "#9ed6ff", 16);
      addRing(tower.col + 0.5, tower.row + 0.8, 0.2, 1.1, track === "dmg" ? "#ffd98a" : "#9ed6ff", 0.5);
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
      const cost = price(specCost(tower.kind));
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
      pillar(tower.col + 0.5, tower.row + 0.5, def.color, 26);
      addFlash(tower.col + 0.5, tower.row + 0.5, 2.6, def.color, 0.5);
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
      dust(tower.col + 0.5, tower.row + 0.6, 14, 0.8);
      pillar(tower.col + 0.5, tower.row + 0.5, "#e2b15a", 8);
      sfx("coin");
      saveRun();
      flush();
    },
    freeze() {
      audio.unlock();
      if (phase !== "combat") {
        say("Заморозка работает только в бою");
        return;
      }
      if (paused) return;
      if (freezeCd > 0) {
        sfx("deny");
        say(`Заморозка будет готова через ${Math.ceil(freezeCd)} с`);
        return;
      }
      castFreeze();
    },
    storm() {
      audio.unlock();
      if (phase !== "combat") {
        say("Гроза бьёт только в бою");
        return;
      }
      if (paused) return;
      if (stormCd > 0) {
        sfx("deny");
        say(`Гроза будет готова через ${Math.ceil(stormCd)} с`);
        return;
      }
      castStorm();
    },
    rally() {
      audio.unlock();
      if (phase !== "combat") {
        say("Набат звучит только в бою");
        return;
      }
      if (paused) return;
      if (rallyCd > 0) {
        sfx("deny");
        say(`Набат будет готов через ${Math.ceil(rallyCd)} с`);
        return;
      }
      castRally();
    },
    wrath() {
      audio.unlock();
      if (phase !== "combat") {
        say("Гнев Димона — только в бою");
        return;
      }
      if (paused || world.wrathT > 0) return;
      if (rage < WRATH_NEED) {
        sfx("deny");
        say(`Гнев копится: ${Math.floor(rage)} из ${WRATH_NEED}`);
        return;
      }
      castWrath();
    },
    choosePerk(index) {
      if (!perkOptions || phase !== "prep") return;
      const id = perkOptions[index];
      if (!id) return;
      perks.add(id);
      perkOptions = null;
      if (id === "gates") lives += PERK_LIVES;
      refreshTowers();
      prepLeft = PREP_SECONDS;
      prepShown = PREP_SECONDS;
      sfx("perk");
      banner = `${PERKS[id].name}: ${PERKS[id].blurb}`;
      bannerT = 3;
      saveRun();
      flush();
    },
    chooseEvent(index) {
      if (!eventId || phase !== "prep") return;
      const def = EVENTS[eventId];
      const option = def.options[index];
      const view = eventView()!.options[index]!;
      if (view.disabled) {
        sfx("deny");
        say(option.cost > 0 ? "Не хватает золота" : "Тут не получится");
        return;
      }
      if (option.cost > 0) pay(option.cost);
      switch (eventId) {
        case "trader":
          if (index === 0) bonus = { ...bonus, dmg: 0.3 };
          else gold += 60;
          break;
        case "crate":
          if (index === 1) gold += 30;
          else if (Math.random() < 0.5) {
            gold += 160;
            float(world.map.routes[0]![0]!.x, world.map.routes[0]![0]!.y, "+160", "#e2b15a");
          } else bonus = { ...bonus, healers: 2 };
          break;
        case "well":
          if (index === 0) {
            lives = Math.max(1, lives - 2);
            gold += 200;
            world.hurt = 1;
          }
          break;
        case "camp":
          if (index === 0) lives = Math.min(DIFFICULTIES[runDifficulty].lives, lives + 2);
          else {
            abilityCd = 0;
            abilityShown = 0;
            freezeCd = 0;
            freezeShown = 0;
          }
          break;
        case "scout":
          if (index === 0) bonus = { ...bonus, hp: 0.75 };
          else gold += 20;
          break;
      }
      eventId = null;
      prepLeft = PREP_SECONDS;
      prepShown = PREP_SECONDS;
      sfx("coin");
      banner = option.hint;
      bannerT = 2.6;
      saveRun();
      flush();
    },
    upgradeAll() {
      audio.unlock();
      if (phase === "menu" || phase === "victory" || phase === "defeat") return;
      const steps = upgradeSteps();
      if (!steps.length) {
        sfx("deny");
        say(world.towers.length ? "Всё уже на максимуме" : "Прокачивать нечего: на поле нет башен");
        return;
      }
      let done = 0;
      for (const step of steps) {
        if (!canPay(step.cost)) continue;
        // дешёвые шаги идут первыми, но ранги одной башни должны покупаться по порядку: цену считаем заново
        const rank = step.track === "dmg" ? step.tower.dmgRank : step.tower.rateRank;
        if (rank >= MAX_RANK) continue;
        const cost = price(upgradeCost(TOWERS[step.tower.kind].cost, rank));
        if (!canPay(cost)) continue;
        pay(cost);
        step.tower.spent += cost;
        if (step.track === "dmg") step.tower.dmgRank++;
        else step.tower.rateRank++;
        done++;
      }
      refreshTowers();
      for (const tower of world.towers) {
        if (TOWERS[tower.kind].aura > 0) continue;
        addRing(tower.col + 0.5, tower.row + 0.5, 0.2, 0.9, "#e2b15a", 0.5);
        pillar(tower.col + 0.5, tower.row + 0.5, "#ffd98a", 10);
      }
      const left = upgradeSteps().length;
      if (done) sfx("upgrade");
      else sfx("deny");
      banner = !done
        ? "Не хватает золота даже на одно улучшение"
        : left
          ? `Прокачано улучшений: ${done}. Не хватило золота ещё на ${left}`
          : `Всё на максимуме (${done} улучшений)`;
      bannerT = 2.6;
      saveRun();
      flush();
    },
    callWave() {
      audio.unlock();
      if (perkOptions) {
        sfx("deny");
        say("Сначала выбери дар");
        return;
      }
      if (eventId) {
        sfx("deny");
        say("Сначала реши, что делать на тропе");
        return;
      }
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
      if (type === "drag") {
        // зажатый палец ведёт по полю: башня выбранного вида встаёт в каждую свободную клетку на пути
        if (phase === "menu" || phase === "victory" || phase === "defeat" || aiming || !build) return;
        place(col, row, true);
        return;
      }
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
      let scale = 1;
      if (world.slowmo > 0) {
        world.slowmo = Math.max(0, world.slowmo - capped);
        scale = 0.35;
      }
      acc += capped * speed * scale;
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
