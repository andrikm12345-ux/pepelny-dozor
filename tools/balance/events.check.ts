import { createSim } from "../../src/game/sim";
import type { Creep } from "../../src/game/sim";
import { ENEMIES, FREEZE_COOLDOWN, getMap, isRoad, type EnemyKind } from "../../src/game/balance";

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
let bad = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) bad++; console.log(cond ? "ок  " : "ОШИБКА", name, extra); };
const map = getMap("ash");
let uid = 9000;
function mk(kind: EnemyKind, x: number, y: number, extra: Partial<Creep> = {}): Creep {
  const def = ENEMIES[kind];
  return { id: uid++, kind, x, y, route: 0, wpi: 1, travel: 0, hp: def.hp, maxHp: def.hp, speed: 0, gold: 1, armor: 1, flying: def.flying, scale: def.scale, color: def.color,
    slow: 1, slowT: 0, flash: 0, alive: true, vx: 0, vy: 0, iceT: 0, healT: 99, shield: 0, stun: 0, brittleT: 0, brittle: 0, summonT: 99, ownerId: 0, ...extra };
}
function freeCells(n: number) { const out: Array<[number, number]> = []; for (let r = 0; r < 11 && out.length < n; r++) for (let c = 0; c < 18 && out.length < n; c++) if (!isRoad(map, c, r) && (c + r) % 3 === 0) out.push([c, r]); return out; }

// до события доходим читом с кучей баллист
function toEvent() {
  const s = createSim(); s.toggleCheat(); s.start();
  for (const [c, r] of freeCells(10)) { s.selectBuild("ballista"); s.pointer(c, r, "down"); s.dismiss(); }
  for (let w = 0; w < 2; w++) {
    s.callWave();
    for (let t = 0; t < 1500 && s.getSnapshot().phase === "combat"; t++) s.simulate(0.2);
  }
  return s;
}

const seen = new Map<string, number>();
const checks: Array<[string, boolean, string]> = [];
let first = true;
for (let i = 0; i < 150 && [...seen.values()].reduce((a, b) => a + Math.min(b, 2), 0) < 10; i++) {
  const s = toEvent();
  const ev = s.getSnapshot().event;
  if (!ev) { ok("событие после 2-й волны", false, "события нет"); break; }
  if (first) {
    first = false;
    ok("событие: таймер ждёт выбора", s.getSnapshot().prepLeft === null && s.getSnapshot().phase === "prep");
    s.callWave();
    ok("событие: волну не вызвать, пока не выбрано", s.getSnapshot().phase === "prep" && !!s.getSnapshot().event);
  }
  const key = ev.id;
  const idx = (seen.get(key) ?? 0) as number;
  if (idx >= 2) continue;
  seen.set(key, idx + 1);
  s.toggleCheat(); // дальше золото тратится по-настоящему
  const g0 = s.getSnapshot().gold, l0 = s.getSnapshot().lives;
  const opt = idx as 0 | 1;
  s.chooseEvent(opt);
  const h = s.getSnapshot();
  if (h.event && h.event.options[opt]!.disabled) continue;
  const dg = h.gold - g0, dl = h.lives - l0;
  const done = !h.event && h.prepLeft !== null;
  checks.push([`${ev.title} / вариант ${opt + 1}: событие закрыто, таймер пошёл`, done, ""]);
  if (key === "trader" && opt === 0) checks.push(["торговец: −80 золота", dg === -80, `Δзолото ${dg}`]);
  if (key === "trader" && opt === 1) checks.push(["торговец: +60 золота", dg === 60, `Δзолото ${dg}`]);
  if (key === "crate" && opt === 1) checks.push(["ящик: обойти даёт +30", dg === 30, `Δзолото ${dg}`]);
  if (key === "crate" && opt === 0) {
    s.world.enemies.length = 0;
    const gotGold = dg === 160;
    let healers = 0;
    if (!gotGold) { s.callWave(); for (let t = 0; t < 400; t++) { s.simulate(0.1); healers = Math.max(healers, s.world.enemies.filter((e) => e.kind === "healer").length); } }
    checks.push(["ящик: +160 золота или два знахаря", gotGold || healers >= 2, `Δзолото ${dg}, знахарей ${healers}`]);
  }
  if (key === "well" && opt === 0) checks.push(["колодец: −2 жизни, +200", dl === -2 && dg === 200, `Δжизни ${dl}, Δзолото ${dg}`]);
  if (key === "well" && opt === 1) checks.push(["колодец: отказ ничего не меняет", dl === 0 && dg === 0]);
  if (key === "camp" && opt === 0) checks.push(["привал: жизни не больше стартовых", h.lives >= l0 && h.lives <= 18, `жизни ${l0} → ${h.lives}`]);
  if (key === "camp" && opt === 1) checks.push(["привал: способности готовы", h.abilityLeft === 0 && h.freezeLeft === 0]);
  if (key === "scout" && opt === 0) {
    s.callWave();
    s.world.enemies.length = 0;
    s.simulate(0.4);
    let hp = 0;
    for (let t = 0; t < 40 && !hp; t++) { s.simulate(0.1); const e = s.world.enemies.find((x) => x.alive); if (e) hp = e.maxHp; }
    const base = ENEMIES[hp > 0 ? s.world.enemies.find((x) => x.alive)!.kind : "mite"].hp;
    checks.push(["разведчик: −60 и твари тоньше на 25%", dg === -60 && Math.abs(hp / base - 0.75) < 0.03, `Δзолото ${dg}, hp ${hp} из ${base}`]);
  }
  if (key === "scout" && opt === 1) checks.push(["разведчик: отмахнуться даёт +20", dg === 20, `Δзолото ${dg}`]);
}
for (const [n, c, e] of checks) ok(n, c, e);
ok("все пять событий встретились", seen.size === 5, [...seen.keys()].join(", "));

// заморозка
{
  const s = createSim(); s.toggleCheat(); s.start();
  s.freeze();
  ok("заморозка: до боя нельзя", s.getSnapshot().freezeLeft === 0);
  s.callWave(); s.world.enemies.length = 0;
  const a = mk("husk", map.routes[0]![1]!.x - 1, map.routes[0]![1]!.y, { speed: 2, hp: 500, maxHp: 500 });
  const b = mk("boss", map.routes[0]![1]!.x - 2, map.routes[0]![1]!.y, { speed: 2, hp: 5000, maxHp: 5000 });
  s.world.enemies.push(a, b);
  s.simulate(0.2);
  s.freeze();
  ok("заморозка: стан 2.2 с и лёд, у Тарана 0.5", a.stun > 2 && a.iceT > 2 && b.stun > 0.4 && b.stun <= 0.5, `стан ${a.stun.toFixed(2)} / ${b.stun.toFixed(2)}`);
  ok("заморозка: лишний урон +20%", a.brittle >= 0.2 && a.brittleT > 2);
  const x0 = a.x;
  s.simulate(1.5);
  ok("заморозка: тварь стоит на месте", Math.abs(a.x - x0) < 0.001, `сдвиг ${(a.x - x0).toFixed(3)}`);
  s.simulate(1.5);
  ok("заморозка: потом идёт дальше", a.x > x0 + 0.1);
  ok("заморозка: перезарядка на HUD", s.getSnapshot().freezeLeft > FREEZE_COOLDOWN - 6 && s.getSnapshot().freezeLeft <= FREEZE_COOLDOWN, `осталось ${s.getSnapshot().freezeLeft}`);
  const left = s.getSnapshot().freezeLeft;
  s.freeze();
  ok("заморозка: повтор до перезарядки не срабатывает", s.getSnapshot().freezeLeft === left);
}
console.log(bad ? `\nПровалено: ${bad}` : "\nВсе проверки прошли");
process.exit(bad ? 1 : 0);
