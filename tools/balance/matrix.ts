/**
 * Матрица баланса: гоняет бота по картам, сложностям и расстановкам и печатает таблицы.
 * Запуск: npm run balance [-- --runs 8] [-- --quick]
 */
import { MAP_ORDER, TOWER_ORDER, type Difficulty, type MapId, type TowerKind } from "../../src/game/balance";
import { playGame, type PlayResult } from "./play";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string, fallback: number) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? Number(args[at + 1]) || fallback : fallback;
};
const RUNS = flag("quick") ? 3 : value("runs", 8);
const ONLY = args.includes("--only") ? (args[args.indexOf("--only") + 1] ?? "").split(",") : [];
const want = (section: string) => !ONLY.length || ONLY.includes(section);

type Level = "novice" | "pro";
/** Новичок не берёт мастерство и не жмёт способности; опытный делает всё. */
const LEVEL_NAME: Record<Level, string> = { novice: "новичок", pro: "опытный" };

const MIX_A: TowerKind[] = "archer,archer,frost,ballista,archer,ember,ballista,ballista,archer,frost,ballista,ember,ballista".split(",") as TowerKind[];
const MIX_B: TowerKind[] = "archer,archer,tesla,frost,ballista,banner,tesla,ember,archer,ballista,banner,tesla,ember".split(",") as TowerKind[];
const mono = (kind: TowerKind): TowerKind[] => Array.from({ length: 13 }, () => kind);

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const pct = (part: number, total: number) => `${Math.round((100 * part) / Math.max(1, total))}%`.padStart(4);

interface Row {
  win: string;
  median: number;
  early: number;
  mid: number;
  ramp: number;
}

function runMany(map: MapId, difficulty: Difficulty, plan: TowerKind[], level: Level): PlayResult[] {
  const out: PlayResult[] = [];
  const pro = level === "pro";
  for (let i = 0; i < RUNS; i++) out.push(playGame({ map, difficulty, plan, useSpecs: pro, useAbilities: pro, eventPick: "random" }));
  return out;
}

/** Жизни, потерянные между началом волн from и to (нумерация с 1); если не дожили, до конца. */
function lost(result: PlayResult, from: number, to: number): number {
  const lives = result.livesAtWave;
  const start = lives[from - 1];
  if (start === undefined) return 0;
  const end = lives[to - 1] ?? 0;
  return Math.max(0, start - end);
}

/** Сколько волн прошло от первой потери жизни после 12-й волны до поражения. */
function ramp(result: PlayResult): number {
  const lives = result.livesAtWave;
  let first = -1;
  for (let w = 13; w < lives.length; w++) {
    if (lives[w]! < lives[w - 1]!) {
      first = w;
      break;
    }
  }
  return first < 0 ? 0 : lives.length - first;
}

function summarize(results: PlayResult[]): Row {
  return {
    win: pct(results.filter((r) => r.won).length, results.length),
    median: median(results.map((r) => r.cleared)),
    early: mean(results.map((r) => lost(r, 1, 5))),
    mid: mean(results.map((r) => lost(r, 5, 13))),
    ramp: mean(results.map(ramp)),
  };
}

const fmt = (row: Row) =>
  `победа ${row.win} | медиана волн ${String(row.median).padStart(2)} | потери 1–4: ${row.early.toFixed(1).padStart(4)} | потери 5–12: ${row.mid.toFixed(1).padStart(4)} | ступень конца ${row.ramp.toFixed(1)}`;

console.log(`Матрица баланса, прогонов на ячейку: ${RUNS}\n`);

if (want("mix")) {
  for (const level of ["novice", "pro"] as const) {
    console.log(`== Смешанные расстановки, обычная сложность, уровень «${LEVEL_NAME[level]}»`);
    for (const [name, plan] of [["А: лук/баллиста/костёр", MIX_A], ["Б: молния/знамя", MIX_B]] as const) {
      for (const map of MAP_ORDER) console.log(`${name.padEnd(24)} ${map.padEnd(8)} ${fmt(summarize(runMany(map, "normal", plan, level)))}`);
    }
    console.log();
  }
}

if (want("mono")) {
  console.log("== Башни по одной, обычная сложность, «новичок» (победа = дошёл до 12-й)");
  for (const kind of TOWER_ORDER) {
    const cells = MAP_ORDER.map((map) => `${map} ${summarize(runMany(map, "normal", mono(kind), "novice")).win}`);
    console.log(`${kind.padEnd(9)} ${cells.join(" | ")}`);
  }
  console.log();
}

if (want("diff")) {
  for (const level of ["novice", "pro"] as const) {
    console.log(`== Сложности, расстановка А, уровень «${LEVEL_NAME[level]}»`);
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const cells = MAP_ORDER.map((map) => `${map} ${summarize(runMany(map, difficulty, MIX_A, level)).win}`);
      console.log(`${difficulty.padEnd(7)} ${cells.join(" | ")}`);
    }
    console.log();
  }
}
