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
    blurb: "Быстрые стрелы по одной цели. Средняя дуга.",
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
    name: "Жар-башня",
    blurb: "Медленный залп по площади. Летунов не берёт.",
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
    name: "Морозный фонарь",
    blurb: "Слабый урон, но надолго сковывает шаг.",
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
    name: "Баллиста",
    blurb: "Дальний выстрел. Пробивает броню латников.",
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
    tag: "",
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
    tag: "быстрый",
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
    tag: "броня",
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
    tag: "лёт",
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
    tag: "босс",
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

/** Axis-aligned corners. Enemies walk this polyline; cells between them are the road. */
export const CORNERS: Array<[number, number]> = [
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
];

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

export const PATH_CELLS = buildPath(CORNERS);
export const PATH_SET = new Set(PATH_CELLS.map(([c, r]) => `${c},${r}`));

export const WAYPOINTS = CORNERS.map(([c, r]) => ({ x: c + 0.5, y: r + 0.5 }));

const seen = new Set<string>();
for (const [c, r] of PATH_CELLS) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) throw new Error("path out of bounds");
  const key = `${c},${r}`;
  if (seen.has(key)) throw new Error(`path overlaps at ${key}`);
  seen.add(key);
}

export function isInside(col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < COLS && row < ROWS;
}

export function isRoad(col: number, row: number): boolean {
  return PATH_SET.has(`${col},${row}`);
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
  const wave = WAVES[index];
  if (!wave) return [];
  const map = new Map<EnemyKind, number>();
  for (const group of wave) map.set(group.kind, (map.get(group.kind) ?? 0) + group.count);
  return [...map.entries()].map(([kind, count]) => ({
    kind,
    name: ENEMIES[kind].name,
    tag: ENEMIES[kind].tag,
    count,
  }));
}
