export const COLS = 18;
export const ROWS = 11;

export const START_GOLD = 180;
export const START_LIVES = 18;
export const PREP_SECONDS = 8;
export const SELL_RATIO = 0.6;
export const MAX_RANK = 3;

export type TowerKind = "archer" | "ember" | "frost" | "ballista";
export type EnemyKind = "mite" | "runner" | "husk" | "wisp" | "boss";
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
}

export interface SpawnGroup {
  kind: EnemyKind;
  count: number;
  interval: number;
}

export const TOWER_ORDER: TowerKind[] = ["archer", "ember", "frost", "ballista"];

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
  },
};

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
  traits.push(def.hitsFlying ? { label: "земля и воздух" } : { label: "только земля", bad: true });
  if (def.splash > 0) traits.push({ label: "по площади" });
  if (def.slow > 0) traits.push({ label: "замедляет" });
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
  if (k % 3 === 0) groups.push({ kind: "boss", count: Math.ceil(k / 6), interval: 1.6 });
  if (mix === 2) groups.push({ kind: "husk", count: 3 + Math.floor(k / 2), interval: gap(0.5) });
  return groups;
}
