export const COLS = 18;
export const ROWS = 11;

export const START_GOLD = 180;
export const START_LIVES = 18;
export const PREP_SECONDS = 8;
export const SELL_RATIO = 0.6;
export const MAX_RANK = 3;

export type TowerKind = "archer" | "ember" | "frost" | "ballista" | "tesla" | "banner";
export type EnemyKind = "mite" | "runner" | "husk" | "wisp" | "healer" | "shield" | "summoner" | "boss";
export type TargetMode = "first" | "last" | "close" | "strong";

export interface TowerDef {
  kind: TowerKind;
  name: string;
  blurb: string;
  cost: number;
  range: number;
  damage: number;
  rate: number;
  shotSpeed: number;
  splash: number;
  slow: number;
  slowTime: number;
  pierce: boolean;
  hitsFlying: boolean;
  shot: string;
  /** Сколько раз молния перескакивает на соседних тварей. 0 — обычный выстрел. */
  chain: number;
  /** Радиус усиления соседних башен. 0 — башня стреляет сама. */
  aura: number;
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  tag: string;
  hp: number;
  speed: number;
  gold: number;
  armor: number;
  flying: boolean;
  scale: number;
  color: string;
  /** Сколько попаданий гасит щит. */
  shield?: number;
  /** Призыв: раз в every секунд выпускает count угольков, но не больше cap живых. */
  summon?: { every: number; count: number; cap: number };
}

export interface SpawnGroup {
  kind: EnemyKind;
  count: number;
  interval: number;
}

export const TOWER_ORDER: TowerKind[] = ["archer", "ember", "frost", "ballista", "tesla", "banner"];

export const TOWERS: Record<TowerKind, TowerDef> = {
  archer: {
    kind: "archer",
    name: "Лук Димона",
    blurb: "Лук Димона. Бьёт одну тварь и бьёт часто. Его любимая башня на углу.",
    cost: 70,
    range: 2.55,
    damage: 12,
    rate: 1.25,
    shotSpeed: 9,
    splash: 0,
    slow: 0,
    slowTime: 0,
    pierce: false,
    hitsFlying: true,
    shot: "#e7efe6",
    chain: 0,
    aura: 0,
  },
  ember: {
    kind: "ember",
    name: "Костёр Димона",
    blurb: "Жар по площади. Летунов не достаёт: Димон проверял и обжёг бровь.",
    cost: 155,
    range: 2.35,
    damage: 26,
    rate: 0.46,
    shotSpeed: 6.2,
    splash: 1.12,
    slow: 0,
    slowTime: 0,
    pierce: false,
    hitsFlying: false,
    shot: "#e25b3a",
    chain: 0,
    aura: 0,
  },
  frost: {
    kind: "frost",
    name: "Фонарь Димона",
    blurb: "Слабый удар, зато вяжет шаг. Димон ставит его на шустрых.",
    cost: 110,
    range: 2.15,
    damage: 6,
    rate: 0.95,
    shotSpeed: 7.5,
    splash: 0,
    slow: 0.46,
    slowTime: 2.3,
    pierce: false,
    hitsFlying: true,
    shot: "#9ec4d4",
    chain: 0,
    aura: 0,
  },
  ballista: {
    kind: "ballista",
    name: "Баллиста Димона",
    blurb: "Дальний болт. Единственное, чем Димон прошивает броню латников.",
    cost: 200,
    range: 3.55,
    damage: 62,
    rate: 0.36,
    shotSpeed: 12,
    splash: 0,
    slow: 0,
    slowTime: 0,
    pierce: true,
    hitsFlying: true,
    shot: "#e2b15a",
    chain: 0,
    aura: 0,
  },
  tesla: {
    kind: "tesla",
    name: "Молния Димона",
    blurb: "Бьёт тварь и перескакивает по соседним. Лучшая против плотной толпы.",
    cost: 175,
    range: 2.3,
    damage: 20,
    rate: 0.9,
    shotSpeed: 0,
    splash: 0,
    slow: 0,
    slowTime: 0,
    pierce: false,
    hitsFlying: true,
    shot: "#8fd6ff",
    chain: 3,
    aura: 0,
  },
  banner: {
    kind: "banner",
    name: "Знамя Димона",
    blurb: "Сама не стреляет, зато соседним башням даёт +30% урона и +20% скорости.",
    cost: 130,
    range: 2.1,
    damage: 0,
    rate: 0,
    shotSpeed: 0,
    splash: 0,
    slow: 0,
    slowTime: 0,
    pierce: false,
    hitsFlying: true,
    shot: "#e2623e",
    chain: 0,
    aura: 2.1,
  },
};

/** Усиление от одного знамени; два знамени рядом складываются, третье уже не добавляет. */
export const BANNER_DMG = 0.3;
export const BANNER_RATE = 0.2;
export const BANNER_MAX = 2;

/** Молния: затухание урона на каждый прыжок и дальность прыжка в клетках. */
export const CHAIN_FALLOFF = 0.8;
export const CHAIN_REACH = 1.5;

/** Лекарь: как часто лечит, радиус и доля здоровья за один импульс. */
export const HEAL_EVERY = 1.5;
export const HEAL_RADIUS = 1.7;
export const HEAL_FRACTION = 0.03;

/** Обвал Димона: способность по клику. */
export const ABILITY_COOLDOWN = 24;
export const ABILITY_RADIUS = 1.7;
export const ABILITY_DELAY = 0.45;
export const ABILITY_BASE = 90;
export const ABILITY_PER_WAVE = 28;

export function abilityDamage(waveIndex: number): number {
  return ABILITY_BASE + ABILITY_PER_WAVE * waveIndex;
}

/** Заморозка Димона: все твари на поле встают, а потом ещё немного получают лишний урон. */
export const FREEZE_COOLDOWN = 40;
export const FREEZE_TIME = 2.2;
export const FREEZE_BOSS = 0.5;
export const FREEZE_BRITTLE = 0.2;

/** Хрупкость и горение живут столько секунд. */
export const BRITTLE_TIME = 3;
export const BURN_TIME = 2.5;

export type SpecId =
  | "sniper"
  | "volley"
  | "inferno"
  | "volcano"
  | "stasis"
  | "brittle"
  | "pierce"
  | "stun"
  | "storm"
  | "arc"
  | "warband"
  | "watch";

export interface SpecDef {
  id: SpecId;
  tower: TowerKind;
  name: string;
  blurb: string;
  color: string;
}

/** Две ветки мастерства для каждой башни. */
export const SPECS: Record<TowerKind, [SpecDef, SpecDef]> = {
  archer: [
    { id: "sniper", tower: "archer", name: "Снайпер", blurb: "Дальше и сильнее, но реже: урон ×1.9, дуга +1.2.", color: "#f2e6a8" },
    { id: "volley", tower: "archer", name: "Град стрел", blurb: "Бьёт сразу по трём разным целям.", color: "#a8f2c2" },
  ],
  ember: [
    { id: "inferno", tower: "ember", name: "Пекло", blurb: "После взрыва земля горит 2.5 с и жжёт сквозь щиты.", color: "#ff7a3a" },
    { id: "volcano", tower: "ember", name: "Вулкан", blurb: "Взрыв шире в полтора раза и достаёт летунов.", color: "#ffb35a" },
  ],
  frost: [
    { id: "stasis", tower: "frost", name: "Стужа", blurb: "Замедляет сильнее и по площади.", color: "#bfe8ff" },
    { id: "brittle", tower: "frost", name: "Хрупкость", blurb: "Цель 3 с получает на 30% больше урона от всех.", color: "#d9c8ff" },
  ],
  ballista: [
    { id: "pierce", tower: "ballista", name: "Пробой", blurb: "Болт летит насквозь и бьёт всех на линии.", color: "#ffd88a" },
    { id: "stun", tower: "ballista", name: "Оглушение", blurb: "Урон ×1.4 и стоп на 0.6 с (у Тарана 0.2 с).", color: "#ffb08a" },
  ],
  tesla: [
    { id: "storm", tower: "tesla", name: "Гроза", blurb: "Шесть прыжков, молния почти не слабеет.", color: "#8fd6ff" },
    { id: "arc", tower: "tesla", name: "Разряд", blurb: "Один прыжок, урон ×1.8 и стоп цели на 0.35 с.", color: "#e6b8ff" },
  ],
  banner: [
    { id: "warband", tower: "banner", name: "Боевое", blurb: "Соседям ещё +20% урона (всего +50%).", color: "#ff8a6a" },
    { id: "watch", tower: "banner", name: "Дозорное", blurb: "Соседям +20% дальности и ещё +15% скорости.", color: "#8fe0b0" },
  ],
};

export const SPEC_BY_ID = Object.fromEntries(
  Object.values(SPECS).flatMap((pair) => pair.map((def) => [def.id, def])),
) as Record<SpecId, SpecDef>;

/** Сколько рангов нужно для мастерства; у Знамени рангов нет — доступно сразу. */
export function specNeed(kind: TowerKind): number {
  return TOWERS[kind].aura > 0 ? 0 : SPEC_RANKS;
}

export const SPEC_RANKS = 3;

export function specCost(kind: TowerKind): number {
  return Math.round(TOWERS[kind].cost * 1.2);
}

/** Усиление от знамён вокруг башни. */
export interface Buff {
  count: number;
  dmg: number;
  rate: number;
  range: number;
}

export const NO_BUFF: Buff = { count: 0, dmg: 0, rate: 0, range: 0 };

export interface TowerStats {
  damage: number;
  rate: number;
  range: number;
  splash: number;
  slow: number;
  slowTime: number;
  pierce: boolean;
  hitsFlying: boolean;
  chain: number;
  chainFalloff: number;
  /** Сколько целей за выстрел. */
  targets: number;
  /** Болт насквозь по линии. */
  line: boolean;
  stun: number;
  brittle: number;
  /** Урон в секунду на горящей земле. */
  burn: number;
  /** Что даёт соседним башням (только знамя). */
  auraDmg: number;
  auraRate: number;
  auraRange: number;
}

/** Итоговые характеристики башни: ранги, ветка и знамёна в одном месте. */
export function towerStats(
  kind: TowerKind,
  dmgRank: number,
  rateRank: number,
  spec: SpecId | null,
  buff: Buff = NO_BUFF,
): TowerStats {
  const def = TOWERS[kind];
  const st: TowerStats = {
    damage: def.damage * dmgMult(dmgRank),
    rate: def.rate * rateMult(rateRank),
    range: def.range,
    splash: def.splash,
    slow: def.slow,
    slowTime: def.slowTime,
    pierce: def.pierce,
    hitsFlying: def.hitsFlying,
    chain: def.chain,
    chainFalloff: CHAIN_FALLOFF,
    targets: 1,
    line: false,
    stun: 0,
    brittle: 0,
    burn: 0,
    auraDmg: def.aura > 0 ? BANNER_DMG : 0,
    auraRate: def.aura > 0 ? BANNER_RATE : 0,
    auraRange: 0,
  };
  switch (spec) {
    case "sniper":
      st.range += 1.2;
      st.damage *= 1.9;
      st.rate *= 0.65;
      break;
    case "volley":
      st.targets = 3;
      st.damage *= 0.75;
      break;
    case "inferno":
      st.burn = st.damage * 0.35;
      break;
    case "volcano":
      st.splash *= 1.5;
      st.hitsFlying = true;
      st.damage *= 0.9;
      break;
    case "stasis":
      st.slow = 0.3;
      st.splash = 0.8;
      break;
    case "brittle":
      st.brittle = 0.3;
      break;
    case "pierce":
      st.line = true;
      st.damage *= 0.9;
      break;
    case "stun":
      st.damage *= 1.4;
      st.stun = 0.6;
      break;
    case "storm":
      st.chain = 6;
      st.chainFalloff = 0.9;
      break;
    case "arc":
      st.chain = 1;
      st.damage *= 1.8;
      st.stun = 0.35;
      break;
    case "warband":
      st.auraDmg += 0.2;
      break;
    case "watch":
      st.auraRate += 0.15;
      st.auraRange = 0.2;
      break;
    default:
      break;
  }
  st.damage *= 1 + buff.dmg;
  st.rate *= 1 + buff.rate;
  st.range *= 1 + buff.range;
  return st;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  mite: {
    kind: "mite",
    name: "Уголёк",
    tag: "мелочь",
    hp: 46,
    speed: 1.22,
    gold: 5,
    armor: 1,
    flying: false,
    scale: 0.78,
    color: "#e25b3a",
  },
  runner: {
    kind: "runner",
    name: "Бегун",
    tag: "шустрый",
    hp: 38,
    speed: 2.35,
    gold: 7,
    armor: 1,
    flying: false,
    scale: 0.86,
    color: "#d9d0c2",
  },
  husk: {
    kind: "husk",
    name: "Латник",
    tag: "железо",
    hp: 320,
    speed: 0.72,
    gold: 14,
    armor: 0.36,
    flying: false,
    scale: 0.98,
    color: "#9a938a",
  },
  wisp: {
    kind: "wisp",
    name: "Огонёк",
    tag: "летун",
    hp: 70,
    speed: 1.7,
    gold: 8,
    armor: 1,
    flying: true,
    scale: 0.7,
    color: "#f0d8bf",
  },
  healer: {
    kind: "healer",
    name: "Знахарь",
    tag: "лечит",
    hp: 150,
    speed: 1.1,
    gold: 12,
    armor: 0.8,
    flying: false,
    scale: 0.92,
    color: "#7dff96",
  },
  shield: {
    kind: "shield",
    name: "Щитоносец",
    tag: "щит на 4 удара",
    hp: 180,
    speed: 0.95,
    gold: 13,
    armor: 0.9,
    flying: false,
    scale: 0.96,
    color: "#8fb8d9",
    shield: 4,
  },
  summoner: {
    kind: "summoner",
    name: "Призыватель",
    tag: "зовёт угольков",
    hp: 260,
    speed: 0.7,
    gold: 16,
    armor: 0.8,
    flying: false,
    scale: 1.02,
    color: "#b78cff",
    summon: { every: 4, count: 2, cap: 8 },
  },
  boss: {
    kind: "boss",
    name: "Таран",
    tag: "за Димоном",
    hp: 3200,
    speed: 0.55,
    gold: 80,
    armor: 0.62,
    flying: false,
    scale: 1.42,
    color: "#e2b15a",
  },
};

export const WAVES: SpawnGroup[][] = [
  [{ kind: "mite", count: 10, interval: 0.75 }],
  [
    { kind: "mite", count: 8, interval: 0.5 },
    { kind: "runner", count: 6, interval: 0.42 },
  ],
  [
    { kind: "runner", count: 8, interval: 0.36 },
    { kind: "mite", count: 10, interval: 0.4 },
  ],
  [
    { kind: "husk", count: 5, interval: 1.05 },
    { kind: "mite", count: 8, interval: 0.4 },
  ],
  [
    { kind: "runner", count: 10, interval: 0.32 },
    { kind: "wisp", count: 8, interval: 0.36 },
  ],
  [
    { kind: "husk", count: 5, interval: 0.9 },
    { kind: "runner", count: 10, interval: 0.3 },
    { kind: "wisp", count: 6, interval: 0.34 },
  ],
  [
    { kind: "wisp", count: 12, interval: 0.28 },
    { kind: "husk", count: 5, interval: 0.85 },
    { kind: "runner", count: 8, interval: 0.28 },
  ],
  [
    { kind: "runner", count: 16, interval: 0.24 },
    { kind: "husk", count: 7, interval: 0.75 },
    { kind: "wisp", count: 8, interval: 0.28 },
  ],
  [
    { kind: "husk", count: 8, interval: 0.65 },
    { kind: "wisp", count: 10, interval: 0.26 },
    { kind: "runner", count: 12, interval: 0.24 },
  ],
  [
    { kind: "runner", count: 14, interval: 0.22 },
    { kind: "husk", count: 8, interval: 0.6 },
    { kind: "wisp", count: 12, interval: 0.24 },
  ],
  [
    { kind: "husk", count: 8, interval: 0.55 },
    { kind: "runner", count: 14, interval: 0.22 },
    { kind: "wisp", count: 10, interval: 0.24 },
  ],
  [
    { kind: "husk", count: 6, interval: 0.6 },
    { kind: "runner", count: 12, interval: 0.22 },
    { kind: "boss", count: 1, interval: 1.8 },
    { kind: "wisp", count: 8, interval: 0.26 },
  ],
];

/** Знахари выходят с 6-й волны: сколько в какой (индекс волны с нуля). */
const HEALERS: Record<number, number> = { 5: 1, 6: 2, 7: 2, 8: 3, 9: 3, 10: 3, 11: 3 };
for (const [index, count] of Object.entries(HEALERS)) {
  WAVES[Number(index)]!.splice(1, 0, { kind: "healer", count, interval: 0.8 });
}

/** Щитоносцы с 4-й волны, Призыватели с 7-й (индекс волны с нуля). */
const SHIELDS: Record<number, number> = { 4: 1, 5: 1, 6: 2, 7: 2, 8: 3, 9: 3, 10: 4, 11: 5 };
for (const [index, count] of Object.entries(SHIELDS)) {
  WAVES[Number(index)]!.splice(1, 0, { kind: "shield", count, interval: 0.7 });
}
const SUMMONERS: Record<number, number> = { 7: 1, 8: 1, 9: 1, 10: 2, 11: 2 };
for (const [index, count] of Object.entries(SUMMONERS)) {
  WAVES[Number(index)]!.push({ kind: "summoner", count, interval: 1.6 });
}

export const TARGETS: { id: TargetMode; label: string }[] = [
  { id: "first", label: "Первый" },
  { id: "last", label: "Последний" },
  { id: "close", label: "Ближний" },
  { id: "strong", label: "Сильный" },
];

export type MapId = "ash" | "serpent" | "descent" | "twin";

type Corners = Array<[number, number]>;

export interface MapDef {
  id: MapId;
  name: string;
  blurb: string;
  /** Тропы как углы ломаной; все кончаются в одной клетке — вратах. */
  routes: Corners[];
  /** Прибавка к стартовому золоту. */
  gold: number;
}

export interface Waypoint {
  x: number;
  y: number;
}

export interface GameMap {
  def: MapDef;
  /** Точки поворота для каждой тропы, в центрах клеток. */
  routes: Waypoint[][];
  road: Set<string>;
}

export const MAP_ORDER: MapId[] = ["ash", "serpent", "descent", "twin"];

export const MAPS: Record<MapId, MapDef> = {
  ash: {
    id: "ash",
    name: "Пепельная тропа",
    blurb: "Старая дорога к вратам Димона. Петли, углы, всего понемногу.",
    routes: [
      [
        [0, 1],
        [6, 1],
        [6, 4],
        [2, 4],
        [2, 7],
        [8, 7],
        [8, 3],
        [12, 3],
        [12, 8],
        [16, 8],
        [16, 10],
      ],
    ],
    gold: 0,
  },
  serpent: {
    id: "serpent",
    name: "Змеиный овраг",
    blurb: "Длинная змейка. Твари долго ползут под стрелами.",
    routes: [
      [
        [0, 1],
        [15, 1],
        [15, 3],
        [2, 3],
        [2, 5],
        [15, 5],
        [15, 7],
        [2, 7],
        [2, 9],
        [17, 9],
      ],
    ],
    gold: 0,
  },
  descent: {
    id: "descent",
    name: "Короткий спуск",
    blurb: "Два поворота до врат, времени мало. Димон даёт +250 золота на старте.",
    routes: [
      [
        [0, 2],
        [10, 2],
        [10, 8],
        [17, 8],
      ],
    ],
    gold: 250,
  },
  twin: {
    id: "twin",
    name: "Два портала",
    blurb: "Волна делится надвое и сходится у врат. Держи место встречи. +250 золота на старте.",
    routes: [
      [
        [0, 1],
        [5, 1],
        [5, 3],
        [9, 3],
        [9, 5],
        [17, 5],
      ],
      [
        [0, 9],
        [5, 9],
        [5, 7],
        [9, 7],
        [9, 5],
        [17, 5],
      ],
    ],
    gold: 250,
  },
};

export function buildPath(corners: Array<[number, number]>): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < corners.length - 1; i++) {
    let [c, r] = corners[i]!;
    const [tc, tr] = corners[i + 1]!;
    const dc = Math.sign(tc - c);
    const dr = Math.sign(tr - r);
    if (dc !== 0 && dr !== 0) throw new Error("path segment must be straight");
    if (i === 0) cells.push([c, r]);
    while (c !== tc || r !== tr) {
      c += dc;
      r += dr;
      cells.push([c, r]);
    }
  }
  return cells;
}

/** Собирает карту и проверяет её: в пределах поля, без самопересечений, одни врата. */
export function buildMap(def: MapDef): GameMap {
  const road = new Set<string>();
  let gate = "";
  for (const corners of def.routes) {
    const seen = new Set<string>();
    for (const [c, r] of buildPath(corners)) {
      if (!isInside(c, r)) throw new Error(`${def.id}: path out of bounds`);
      const key = `${c},${r}`;
      if (seen.has(key)) throw new Error(`${def.id}: path overlaps at ${key}`);
      seen.add(key);
      road.add(key);
    }
    const [gc, gr] = corners[corners.length - 1]!;
    if (gate && gate !== `${gc},${gr}`) throw new Error(`${def.id}: routes end at different gates`);
    gate = `${gc},${gr}`;
  }
  return {
    def,
    routes: def.routes.map((corners) => corners.map(([c, r]) => ({ x: c + 0.5, y: r + 0.5 }))),
    road,
  };
}

const BUILT = Object.fromEntries(MAP_ORDER.map((id) => [id, buildMap(MAPS[id])])) as Record<MapId, GameMap>;

export function getMap(id: MapId): GameMap {
  return BUILT[id];
}

export function isInside(col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < COLS && row < ROWS;
}

export function isRoad(map: GameMap, col: number, row: number): boolean {
  return map.road.has(`${col},${row}`);
}

/** Клетка врат — общий конец всех троп карты. */
export function gateOf(map: GameMap): Waypoint {
  const route = map.routes[0]!;
  return route[route.length - 1]!;
}

export function dmgMult(rank: number): number {
  return 1 + rank * 0.45;
}

export function rateMult(rank: number): number {
  return 1 + rank * 0.28;
}

export function upgradeCost(base: number, rank: number): number {
  return Math.round(base * (0.85 + rank * 0.5));
}

export interface WaveEntry {
  kind: EnemyKind;
  name: string;
  tag: string;
  count: number;
}

export function wavePreview(index: number): WaveEntry[] {
  const wave = waveSpec(index);
  const map = new Map<EnemyKind, number>();
  for (const group of wave) map.set(group.kind, (map.get(group.kind) ?? 0) + group.count);
  return [...map.entries()].map(([kind, count]) => ({
    kind,
    name: ENEMIES[kind].name,
    tag: ENEMIES[kind].tag,
    count,
  }));
}

export type Difficulty = "easy" | "normal" | "hard";

export interface DifficultyDef {
  id: Difficulty;
  label: string;
  blurb: string;
  gold: number;
  lives: number;
  hp: number;
}

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "normal", "hard"];

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: {
    id: "easy",
    label: "Лёгкий",
    blurb: "Больше золота и жизней, твари хлипче.",
    gold: 240,
    lives: 25,
    hp: 0.8,
  },
  normal: {
    id: "normal",
    label: "Обычный",
    blurb: "Ночь, как её помнит Димон.",
    gold: START_GOLD,
    lives: START_LIVES,
    hp: 1,
  },
  hard: {
    id: "hard",
    label: "Димон не спит",
    blurb: "Мало жизней, твари толще. Каждая башня на счету.",
    gold: 200,
    lives: 12,
    hp: 1.2,
  },
};

export interface TowerTrait {
  label: string;
  bad?: boolean;
}

/** Короткие бейджи: кого башня достаёт и чем особенна. */
export function towerTraits(def: TowerDef): TowerTrait[] {
  const traits: TowerTrait[] = [];
  if (def.aura > 0) {
    return [{ label: "усиливает соседей" }, { label: "сама не стреляет", bad: true }];
  }
  traits.push(def.hitsFlying ? { label: "земля и воздух" } : { label: "только земля", bad: true });
  if (def.splash > 0) traits.push({ label: "по площади" });
  if (def.slow > 0) traits.push({ label: "замедляет" });
  if (def.chain > 0) traits.push({ label: "цепная молния" });
  if (def.pierce) traits.push({ label: "пробивает броню" });
  else traits.push({ label: "броня гасит урон", bad: true });
  return traits;
}

/** Номер «бесконечной» волны: 1 для 13-й, 2 для 14-й и т. д. 0 — обычные волны. */
export function endlessStep(index: number): number {
  return Math.max(0, index - (WAVES.length - 1));
}

export interface WaveScale {
  hp: number;
  speed: number;
  gold: number;
}

/**
 * Множители тварей. До 12-й волны всё по таблице; дальше здоровье растёт
 * по экспоненте, а золото — линейно, так что ночь рано или поздно побеждает.
 */
export function waveScale(index: number): WaveScale {
  const k = endlessStep(index);
  if (k === 0) return { hp: 1, speed: 1, gold: 1 };
  return {
    hp: Math.pow(1.3, k) * (1 + 0.08 * k),
    speed: Math.min(1.5, 1 + 0.025 * k),
    gold: 1 + 0.03 * k,
  };
}

/** Состав волны: из таблицы или сгенерированный для бесконечной ночи. */
export function waveSpec(index: number): SpawnGroup[] {
  const fixed = WAVES[index];
  if (fixed) return fixed;
  const k = endlessStep(index);
  const gap = (base: number) => Math.max(0.1, base * Math.pow(0.97, k));
  const groups: SpawnGroup[] = [];
  const mix = k % 4;
  if (mix === 0) groups.push({ kind: "mite", count: 14 + 3 * k, interval: gap(0.2) });
  groups.push({ kind: "runner", count: 12 + 2 * k, interval: gap(0.22) });
  groups.push({ kind: "husk", count: 6 + k, interval: gap(0.6) });
  if (mix !== 1) groups.push({ kind: "wisp", count: 8 + k, interval: gap(0.24) });
  groups.push({ kind: "healer", count: 2 + Math.floor(k / 2), interval: gap(0.8) });
  groups.push({ kind: "shield", count: 6 + Math.floor(k / 2), interval: gap(0.7) });
  groups.push({ kind: "summoner", count: 2 + Math.floor(k / 3), interval: gap(1.6) });
  if (k % 3 === 0) groups.push({ kind: "boss", count: Math.ceil(k / 6), interval: 1.6 });
  if (mix === 2) groups.push({ kind: "husk", count: 3 + Math.floor(k / 2), interval: gap(0.5) });
  return groups;
}
