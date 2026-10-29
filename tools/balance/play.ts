/**
 * Бот для проверки баланса: играет партию на безэкранной симуляции.
 * Грубое приближение к человеку: ставит башни по плану в самые «покрытые» клетки,
 * улучшает, берёт мастерство, выбирает события и жмёт способности.
 */
import { createSim, type Sim } from "../../src/game/sim";
import {
  COLS,
  ROWS,
  MAPS,
  TOWERS,
  buildPath,
  getMap,
  isRoad,
  type Difficulty,
  type MapId,
  type TowerKind,
} from "../../src/game/balance";

export interface PlayOptions {
  map: MapId;
  difficulty: Difficulty;
  plan: TowerKind[];
  /** Брать мастерство. */
  useSpecs?: boolean;
  /** Вариант события; "random" — случайный. */
  eventPick?: 0 | 1 | "random";
  /** Жать Обвал и Заморозку. */
  useAbilities?: boolean;
}

export interface PlayResult {
  /** Дошёл до победы на 12-й волне. */
  won: boolean;
  /** Сколько волн пройдено целиком. */
  cleared: number;
  /** Жизни на момент начала каждой волны; индекс 0 — волна 1. */
  livesAtWave: number[];
}

const SPEC_PREF: Record<TowerKind, number> = { archer: 1, ember: 0, frost: 1, ballista: 0, tesla: 0, banner: 0 };

function coverage(cells: Array<[number, number]>, col: number, row: number, range: number): number {
  let n = 0;
  for (const [pc, pr] of cells) if (Math.hypot(pc - col, pr - row) <= range) n++;
  return n;
}

export function playGame(options: PlayOptions): PlayResult {
  const { map: mapId, difficulty, plan } = options;
  const map = getMap(mapId);
  const pathCells = MAPS[mapId].routes.flatMap((route) => buildPath(route));
  const sim = createSim();
  sim.setDifficulty(difficulty);
  sim.setMap(mapId);
  sim.start();

  const used = new Set<string>();
  let step = 0;

  const placeNext = (): boolean => {
    const kind = plan[step % plan.length]!;
    if (sim.getSnapshot().gold < TOWERS[kind].cost) return false;
    let best: [number, number] | null = null;
    let bestScore = -1;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (isRoad(map, col, row) || used.has(`${col},${row}`)) continue;
        const score = coverage(pathCells, col, row, TOWERS[kind].range);
        if (score > bestScore) {
          bestScore = score;
          best = [col, row];
        }
      }
    }
    if (!best) return false;
    sim.selectBuild(kind);
    sim.pointer(best[0], best[1], "down");
    used.add(`${best[0]},${best[1]}`);
    sim.dismiss();
    step++;
    return true;
  };

  const specialize = (): boolean => {
    for (const tower of sim.world.towers) {
      sim.pointer(tower.col, tower.row, "down");
      const sel = sim.getSnapshot().selection;
      let took = false;
      if (sel && sel.specOpen && sim.getSnapshot().gold >= sel.specCost) {
        sim.specialize(sel.specs[SPEC_PREF[tower.kind]]!.id);
        took = true;
      }
      sim.dismiss();
      if (took) return true;
    }
    return false;
  };

  const upgrade = (): boolean => {
    const byCost = [...sim.world.towers].sort((a, b) => TOWERS[b.kind].cost - TOWERS[a.kind].cost);
    for (const tower of byCost) {
      sim.pointer(tower.col, tower.row, "down");
      const sel = sim.getSnapshot().selection;
      const gold = sim.getSnapshot().gold;
      let done = false;
      if (sel) {
        const track = (sel.dmgCost ?? Infinity) <= (sel.rateCost ?? Infinity) ? "dmg" : "rate";
        const cost = track === "dmg" ? sel.dmgCost : sel.rateCost;
        if (cost !== null && cost <= gold) {
          sim.upgrade(track);
          done = true;
        }
      }
      sim.dismiss();
      if (done) return true;
    }
    return false;
  };

  const spend = () => {
    for (;;) {
      if (step < plan.length) {
        if (!placeNext()) return;
        continue;
      }
      if (options.useSpecs && specialize()) continue;
      if (!upgrade()) return;
    }
  };

  const abilities = () => {
    const hud = sim.getSnapshot();
    if (hud.phase !== "combat") return;
    const alive = sim.world.enemies.filter((e) => e.alive);
    if (hud.freezeLeft === 0 && (alive.length >= 10 || alive.some((e) => e.kind === "boss"))) sim.freeze();
    if (hud.abilityLeft === 0 && alive.length >= 6) {
      let target = alive[0]!;
      let bestN = -1;
      for (const e of alive) {
        let n = 0;
        for (const o of alive) if (Math.hypot(o.x - e.x, o.y - e.y) <= 1.7) n++;
        if (n > bestN) {
          bestN = n;
          target = e;
        }
      }
      sim.toggleAim();
      sim.pointer(Math.floor(target.x), Math.floor(target.y), "down", target.x, target.y);
    }
  };

  const livesAtWave: number[] = [];
  let won = false;
  let lastWave = 0;
  for (let t = 0; t < 20000; t += 0.5) {
    const hud = sim.getSnapshot();
    if (hud.wave !== lastWave && hud.phase !== "menu") {
      lastWave = hud.wave;
      livesAtWave[hud.wave - 1] = hud.lives;
    }
    if (hud.phase === "victory") {
      won = true;
      sim.continueEndless();
      continue;
    }
    if (hud.phase === "defeat") break;
    if (hud.event) pickEvent(sim, options.eventPick ?? 1);
    if (options.useAbilities) abilities();
    spend();
    if (hud.phase === "prep" && hud.prepLeft === null && !hud.event) sim.callWave();
    sim.simulate(0.5);
  }
  const end = sim.getSnapshot();
  return { won, cleared: end.cleared, livesAtWave };
}

function pickEvent(sim: Sim, pick: 0 | 1 | "random") {
  const event = sim.getSnapshot().event;
  if (!event) return;
  const want = pick === "random" ? (Math.random() < 0.5 ? 0 : 1) : pick;
  sim.chooseEvent(event.options[want]!.disabled ? (want === 0 ? 1 : 0) : want);
}
