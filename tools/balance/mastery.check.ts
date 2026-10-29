import { createSim } from "../../src/game/sim";
import type { Creep } from "../../src/game/sim";
import { ENEMIES, getMap, isRoad, TOWERS, type EnemyKind, type SpecId, type TowerKind } from "../../src/game/balance";

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
  return {
    id: uid++, kind, x, y, route: 0, wpi: 1, travel: 0, hp: def.hp, maxHp: def.hp, speed: 0, gold: 1, armor: 1,
    flying: def.flying, scale: def.scale, color: def.color, slow: 1, slowT: 0, flash: 0, alive: true, vx: 0, vy: 0,
    iceT: 0, healT: 99, shield: def.shield ?? 0, stun: 0, brittleT: 0, brittle: 0, summonT: 99, ownerId: 0, ...extra,
  };
}
function fresh() { const s = createSim(); s.toggleCheat(); s.start(); return s; }
function put(s: ReturnType<typeof fresh>, kind: TowerKind, c: number, r: number, spec?: SpecId) {
  s.selectBuild(kind); s.pointer(c, r, "down"); s.dismiss();
  s.pointer(c, r, "down");
  if (spec) {
    for (let i = 0; i < 3; i++) s.upgrade("dmg");
    s.specialize(spec);
  }
  const sel = s.getSnapshot().selection!;
  s.dismiss();
  return sel;
}
// свободная клетка рядом с (c0, r0), не тропа
function near(c0: number, r0: number): [number, number] {
  for (let d = 0; d < 6; d++) for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
    const c = c0 + dc, r = r0 + dr;
    if (c < 0 || r < 0 || c > 17 || r > 10 || isRoad(map, c, r)) continue;
    return [c, r];
  }
  return [0, 0];
}
function arena(s: ReturnType<typeof fresh>, ...creeps: Creep[]) {
  s.callWave();
  s.world.enemies.length = 0;
  for (const c of creeps) s.world.enemies.push(c);
}

// 1. щит гасит ровно 4 удара
{
  const s = fresh();
  const [tc, tr] = near(9, 5);
  put(s, "archer", tc, tr);
  arena(s);
  const e = mk("shield", tc + 0.5 + 1, tr + 0.5, { hp: 1000, maxHp: 1000 });
  s.world.enemies.push(e);
  let shieldZeroAt = -1, firstDmgAt = -1, hitsBeforeDmg = 0, lastShield = 4;
  for (let t = 0; t < 120; t++) {
    s.simulate(0.1);
    if (e.shield < lastShield) { hitsBeforeDmg += lastShield - e.shield; lastShield = e.shield; }
    if (e.shield === 0 && shieldZeroAt < 0) shieldZeroAt = t;
    if (e.hp < 1000 && firstDmgAt < 0) firstDmgAt = t;
  }
  ok("щит: четыре удара без урона", firstDmgAt > shieldZeroAt - 1 && hitsBeforeDmg === 4, `щит спал в ${shieldZeroAt}, первый урон в ${firstDmgAt}`);
  ok("щит: потом урон идёт", e.hp < 1000, `hp ${Math.round(e.hp)}`);
}
// 2. оглушение баллисты останавливает
{
  const s = fresh();
  const [tc, tr] = near(9, 5);
  const sel = put(s, "ballista", tc, tr, "stun");
  ok("оглушение: ветка выбрана", sel.spec?.id === "stun", `ветка ${sel.spec?.id}`);
  arena(s);
  const e = mk("husk", tc + 0.5 + 1.5, tr + 0.5, { hp: 5000, maxHp: 5000, speed: 1, armor: 1 });
  e.wpi = 1; e.x = tc + 2; e.y = tr + 0.5;
  s.world.enemies.push(e);
  let maxStun = 0;
  for (let t = 0; t < 60; t++) { s.simulate(0.05); maxStun = Math.max(maxStun, e.stun); }
  ok("оглушение: тварь получает стан", maxStun > 0.3, `стан до ${maxStun.toFixed(2)} с`);
}
// 3. хрупкость
{
  const s = fresh();
  const [tc, tr] = near(9, 5);
  put(s, "frost", tc, tr, "brittle");
  arena(s);
  const e = mk("husk", tc + 1.5, tr + 0.5, { hp: 5000, maxHp: 5000, armor: 1 });
  s.world.enemies.push(e);
  let seen = 0;
  for (let t = 0; t < 40; t++) { s.simulate(0.05); seen = Math.max(seen, e.brittleT); }
  ok("хрупкость: метка стоит 3 с", seen > 2.5 && e.brittle === 0.3, `метка ${seen.toFixed(2)} с, множитель ${e.brittle}`);
}
// 4. Пекло: горящая земля жжёт сквозь щит
{
  const s = fresh();
  const [tc, tr] = near(9, 5);
  put(s, "ember", tc, tr, "inferno");
  arena(s);
  const e = mk("shield", tc + 1.5, tr + 0.5, { hp: 2000, maxHp: 2000 });
  s.world.enemies.push(e);
  let fires = 0, burnedBehindShield = false;
  for (let t = 0; t < 60; t++) {
    s.simulate(0.05);
    fires = Math.max(fires, s.world.fires.length);
    if (e.shield > 0 && e.hp < 2000) burnedBehindShield = true;
  }
  ok("пекло: остаётся горящая земля", fires > 0, `пятен ${fires}`);
  ok("пекло: жжёт сквозь щит", burnedBehindShield, `hp ${Math.round(e.hp)}, щит ${e.shield}`);
}
// 5. Пробой бьёт всех на линии
{
  const s = fresh();
  const [tc, tr] = near(9, 5);
  put(s, "ballista", tc, tr, "pierce");
  arena(s);
  const list = [1.2, 2.0, 2.8].map((d) => mk("husk", tc + 0.5 + d, tr + 0.5, { hp: 5000, maxHp: 5000, armor: 1 }));
  for (const e of list) s.world.enemies.push(e);
  for (let t = 0; t < 12; t++) s.simulate(0.05);
  ok("пробой: задело всех троих", list.every((e) => e.hp < 5000), list.map((e) => Math.round(e.hp)).join(" / "));
}
// 6. Град стрел: три цели
{
  const s = fresh();
  const [tc, tr] = near(9, 5);
  put(s, "archer", tc, tr, "volley");
  arena(s);
  const list = [0.8, 1.1, 1.4].map((d, i) => mk("husk", tc + 0.5 + d, tr + 0.5 + (i - 1) * 0.3, { hp: 5000, maxHp: 5000, armor: 1 }));
  for (const e of list) s.world.enemies.push(e);
  for (let t = 0; t < 30; t++) s.simulate(0.05);
  ok("град стрел: бьёт троих", list.every((e) => e.hp < 5000), list.map((e) => Math.round(e.hp)).join(" / "));
}
// 7. Гроза и Разряд
{
  const s = fresh();
  const [tc, tr] = near(9, 5);
  put(s, "tesla", tc, tr, "storm");
  arena(s);
  const list = Array.from({ length: 9 }, (_, i) => mk("husk", tc + 0.5 + 1 + i * 0.5, tr + 0.5, { hp: 9000, maxHp: 9000, armor: 1 }));
  for (const e of list) s.world.enemies.push(e);
  let longest = 0;
  for (let t = 0; t < 30; t++) { s.simulate(0.05); for (const b of s.world.bolts) longest = Math.max(longest, b.pts.length); }
  ok("гроза: цепочка до 8 точек (башня, цель, 6 прыжков)", longest === 8, `точек в молнии ${longest}`);
  const s2 = fresh();
  const [c2, r2] = near(9, 5);
  put(s2, "tesla", c2, r2, "arc");
  arena(s2);
  const t2 = mk("husk", c2 + 1.5, r2 + 0.5, { hp: 9000, maxHp: 9000, armor: 1, speed: 1 });
  s2.world.enemies.push(t2);
  let st = 0, pts = 0;
  for (let t = 0; t < 30; t++) { s2.simulate(0.05); st = Math.max(st, t2.stun); for (const b of s2.world.bolts) pts = Math.max(pts, b.pts.length); }
  ok("разряд: стоп цели и один удар", st > 0.2 && pts === 2, `стан ${st.toFixed(2)}, точек ${pts}`);
}
// 8. Призыватель не превышает лимит
{
  const s = fresh();
  arena(s);
  const e = mk("summoner", map.routes[0]![1]!.x, map.routes[0]![1]!.y, { hp: 99999, maxHp: 99999, summonT: 0.5 });
  s.world.enemies.push(e);
  let peak = 0;
  for (let t = 0; t < 200; t++) {
    s.simulate(0.1);
    const n = s.world.enemies.filter((x) => x.alive && x.ownerId === e.id).length;
    peak = Math.max(peak, n);
    if (s.getSnapshot().phase === "defeat") break;
  }
  ok("призыватель: зовёт угольков, не больше 8", peak > 0 && peak <= 8, `пик живых ${peak}`);
}
// 9. ветку нельзя до 3 рангов и нельзя дважды
{
  const s = fresh();
  const [tc, tr] = near(9, 5);
  s.selectBuild("archer"); s.pointer(tc, tr, "down"); s.dismiss(); s.pointer(tc, tr, "down");
  s.specialize("sniper");
  ok("мастерство: рано нельзя", s.getSnapshot().selection!.spec === null);
  s.upgrade("dmg"); s.upgrade("dmg"); s.upgrade("rate");
  s.specialize("sniper");
  const a = s.getSnapshot().selection!;
  ok("мастерство: после 3 рангов можно", a.spec?.id === "sniper" && a.range > TOWERS.archer.range + 1, `дуга ${a.range}`);
  s.specialize("volley");
  ok("мастерство: второй раз нельзя", s.getSnapshot().selection!.spec?.id === "sniper");
  const before = s.getSnapshot().gold;
  s.specialize("volley");
  ok("мастерство: повтор не тратит золото", s.getSnapshot().gold === before);
}
// 10. знамя: ветки
{
  const s = fresh();
  const [tc, tr] = near(9, 5);
  const base = put(s, "archer", tc, tr);
  const [bc, br] = near(tc + 1, tr);
  put(s, "banner", bc, br, undefined);
  s.pointer(bc, br, "down");
  s.specialize("watch");
  s.dismiss();
  s.pointer(tc, tr, "down");
  const a = s.getSnapshot().selection!;
  ok("дозорное знамя: дальность +20%", a.buffRange === 20 && a.range > base.range, `дальность ${base.range} → ${a.range}, скорость +${a.buffRate}%`);
  s.dismiss(); s.pointer(bc, br, "down");
  ok("знамя: мастерство доступно сразу", s.getSnapshot().selection!.spec?.id === "watch");
  s.dismiss();
  const s2 = fresh();
  const [c2, r2] = near(9, 5);
  put(s2, "archer", c2, r2);
  const [b2, d2] = near(c2 + 1, r2);
  s2.selectBuild("banner"); s2.pointer(b2, d2, "down"); s2.specialize("warband"); s2.dismiss();
  s2.pointer(c2, r2, "down");
  ok("боевое знамя: +50% урона", s2.getSnapshot().selection!.buffDmg === 50, `+${s2.getSnapshot().selection!.buffDmg}%`);
}
// 11. сохранение с веткой
{
  const s = fresh();
  const [tc, tr] = near(9, 5);
  put(s, "ballista", tc, tr, "pierce");
  s.callWave();
  s.world.enemies.length = 0;
  for (let t = 0; t < 600 && s.getSnapshot().phase === "combat"; t++) s.simulate(0.1);
  const s2 = createSim();
  s2.loadProgress();
  s2.continueRun();
  const t = s2.world.towers[0];
  ok("сохранение: ветка вернулась", !!t && t.spec === "pierce" && t.range >= TOWERS.ballista.range, `ветка ${t?.spec}, дуга ${t?.range}`);
}
console.log(bad ? `\nПровалено: ${bad}` : "\nВсе проверки прошли");
process.exit(bad ? 1 : 0);
