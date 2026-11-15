/**
 * Проверки обновления «Гнев Димона»: способности Димона, умения тварей, дары, сохранение.
 * Запуск вместе с остальными: npm run check:mechanics
 */
import { createSim } from "../../src/game/sim";
import type { Creep } from "../../src/game/sim";
import {
  BLINK_DIST,
  ENEMIES,
  HASTE_MULT,
  PERK_DISCOUNT,
  SILENCE_TIME,
  STORM_TARGETS,
  SPECS,
  TOWERS,
  WRATH_NEED,
  eliteChance,
  getMap,
  isRoad,
  type EnemyKind,
  type TowerKind,
} from "../../src/game/balance";

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
let bad = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (!cond) bad++;
  console.log(cond ? "ок  " : "ОШИБКА", name, extra);
};

const map = getMap("ash");
let uid = 9000;
/** Неподвижная тварь без умений: каждое умение включается в проверке явно. */
function mk(kind: EnemyKind, x: number, y: number, extra: Partial<Creep> = {}): Creep {
  const def = ENEMIES[kind];
  return {
    id: uid++, kind, x, y, route: 0, wpi: 1, travel: 0, hp: def.hp, maxHp: def.hp, speed: 0, gold: 1, armor: 1,
    flying: def.flying, scale: def.scale, color: def.color, slow: 1, slowT: 0, flash: 0, alive: true, vx: 0, vy: 0,
    iceT: 0, healT: 99, shield: 0, stun: 0, brittleT: 0, brittle: 0, summonT: 99, ownerId: 0,
    dashT: 0, dashed: true, shellT: 0, shellCd: 99, blinked: true, castT: 99, reveal: 0, hidden: false, haste: false,
    elite: null, roars: 9, ...extra,
  };
}
type S = ReturnType<typeof createSim>;
function fresh(): S {
  store.clear();
  const s = createSim();
  s.toggleCheat();
  s.start();
  return s;
}
function put(s: S, kind: TowerKind, c: number, r: number) {
  s.selectBuild(kind);
  s.pointer(c, r, "down");
  s.dismiss();
  return s.world.towers.find((t) => t.col === c && t.row === r)!;
}
/** Свободная клетка рядом с (c0, r0), не тропа. */
function near(c0: number, r0: number, taken: Array<[number, number]> = []): [number, number] {
  for (let d = 0; d < 6; d++)
    for (let dr = -d; dr <= d; dr++)
      for (let dc = -d; dc <= d; dc++) {
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c > 17 || r > 10 || isRoad(map, c, r)) continue;
        if (taken.some(([tc, tr]) => tc === c && tr === r)) continue;
        return [c, r];
      }
  return [0, 0];
}
/** Начать бой и убрать тварей волны: на поле только то, что положила проверка. */
function arena(s: S, ...creeps: Creep[]) {
  s.callWave();
  s.simulate(0.02);
  s.world.enemies.length = 0;
  for (const c of creeps) s.world.enemies.push(c);
}
/** Держать поле чистым от тварей самой волны, пока идёт проверка. */
function run(s: S, seconds: number, keep: Creep[]) {
  // simulate(0.05) из-за округления делает лишний шаг; чуть меньше — ровно три шага по 1/60 с
  for (let i = Math.round(seconds / 0.05); i > 0; i--) {
    s.simulate(0.05 - 1e-9);
    for (let i = s.world.enemies.length - 1; i >= 0; i--) {
      const e = s.world.enemies[i]!;
      if (e.id < 9000 && e.ownerId === 0 && !keep.includes(e)) s.world.enemies.splice(i, 1);
    }
  }
}
const [tc, tr] = near(9, 5);
const TX = tc + 0.5;
const TY = tr + 0.5;

// 1. Гроза: бьёт самых здоровых, сбивает щит, уходит на перезарядку
{
  const s = fresh();
  const pack = [900, 800, 700, 600, 500, 400, 300, 200].map((hp, i) => mk("husk", 3 + i, 9.5, { hp, maxHp: hp }));
  pack[0]!.shield = 4;
  arena(s, ...pack);
  s.storm();
  run(s, 1.6, pack);
  const hit = pack.filter((e) => e.hp < e.maxHp).length;
  ok("гроза: бьёт ровно столько целей, сколько положено", hit === STORM_TARGETS, `задето ${hit}`);
  ok("гроза: слабейшие не тронуты", pack[6]!.hp === 300 && pack[7]!.hp === 200);
  ok("гроза: щит сбит и урон прошёл", pack[0]!.shield === 0 && pack[0]!.hp < 900, `hp ${pack[0]!.hp}`);
  ok("гроза: перезарядка пошла", s.getSnapshot().stormLeft > 0, `${s.getSnapshot().stormLeft} с`);
  s.storm();
  ok("гроза: второй раз подряд не бьёт", s.getSnapshot().stormLeft > 20);
}
// 2. Обвал оставляет завал, в нём наземные идут вдвое медленнее, летуны — нет
{
  const s = fresh();
  arena(s);
  s.toggleAim();
  s.pointer(3, 1, "down", 3.5, 1.5);
  run(s, 0.6, []);
  ok("обвал: завал лежит", s.world.rubble.length === 1, `завалов ${s.world.rubble.length}`);
  const inside = mk("mite", 3.5, 1.5, { speed: 1 });
  const flyer = mk("wisp", 3.5, 1.5, { speed: 1 });
  s.world.enemies.push(inside, flyer);
  run(s, 1, [inside, flyer]);
  ok("завал: наземная тварь идёт вдвое медленнее", Math.abs(inside.travel - 0.5) < 0.06, `прошла ${inside.travel.toFixed(2)}`);
  ok("завал: летун идёт как шёл", Math.abs(flyer.travel - 1) < 0.06, `прошёл ${flyer.travel.toFixed(2)}`);
  run(s, 4, [inside, flyer]);
  ok("завал: через 4 с пропадает", s.world.rubble.length === 0);
}
// 3. Осколки: замороженная тварь, умирая, ранит соседа
{
  const s = fresh();
  put(s, "archer", tc, tr);
  const victim = mk("mite", TX + 2.3, TY, { hp: 4, maxHp: 400 });
  const neighbour = mk("mite", TX + 3.1, TY, { hp: 1000, maxHp: 1000 });
  arena(s, victim, neighbour);
  s.freeze();
  run(s, 1.5, [victim, neighbour]);
  ok("осколки: замороженная тварь убита", !victim.alive);
  ok("осколки: сосед получил урон от осколков", neighbour.hp <= 1000 - 100, `hp ${Math.round(neighbour.hp)}`);
}
// 4. Набат: башня бьёт чаще и сильнее, глушение снято и не ложится
{
  const dps = (rally: boolean) => {
    const s = fresh();
    put(s, "archer", tc, tr);
    const dummy = mk("mite", TX + 1.5, TY, { hp: 100000, maxHp: 100000 });
    arena(s, dummy);
    run(s, 1, [dummy]);
    const before = dummy.hp;
    if (rally) s.rally();
    run(s, 5, [dummy]);
    return before - dummy.hp;
  };
  const plain = dps(false);
  const boosted = dps(true);
  // выстрелы идут целыми штуками, поэтому за 5 с выходит 1.6–1.8 раза
  ok("набат: урон за 5 с вырос примерно в 1.7 раза", boosted / plain > 1.45 && boosted / plain < 2, `${plain.toFixed(0)} → ${boosted.toFixed(0)}`);
  const s = fresh();
  const tower = put(s, "archer", tc, tr);
  const caster = mk("silencer", TX + 1.5, TY, { castT: 0.05, hp: 100000, maxHp: 100000 });
  arena(s, caster);
  run(s, 0.3, [caster]);
  ok("глушитель: башня заглушена", tower.silenceT > SILENCE_TIME - 0.4, `${tower.silenceT.toFixed(2)} с`);
  const hpSilenced = caster.hp;
  run(s, 1.5, [caster]);
  ok("глушитель: заглушённая башня не стреляет", caster.hp === hpSilenced, `урон ${hpSilenced - caster.hp}`);
  s.rally();
  ok("набат: снимает глушение", tower.silenceT === 0);
  caster.castT = 0.05;
  run(s, 1, [caster]);
  ok("набат: пока гудит, башню не заглушить", tower.silenceT === 0 && caster.hp < hpSilenced);
  ok("набат: в худе виден", s.getSnapshot().rallyOn && s.getSnapshot().rallyLeft > 0);
}
// 5. Гнев Димона: копится за убийства, без заряда не работает, метеоры бьют
{
  const s = fresh();
  arena(s);
  s.wrath();
  ok("гнев: без заряда не работает", !s.getSnapshot().wrathOn && s.world.meteors.length === 0);
  const fodder = Array.from({ length: WRATH_NEED + 5 }, () => mk("mite", 3.5, 1.5, { hp: 1, maxHp: 1 }));
  s.world.enemies.push(...fodder);
  s.toggleAim();
  s.pointer(3, 1, "down", 3.5, 1.5);
  run(s, 0.7, fodder);
  ok("гнев: шкала заполнена убийствами", s.getSnapshot().rage === WRATH_NEED, `${s.getSnapshot().rage}`);
  const tank = mk("husk", 12.5, 3.5, { hp: 100000, maxHp: 100000 });
  s.world.enemies.push(tank);
  s.wrath();
  ok("гнев: огненный дождь пошёл, шкала обнулилась", s.getSnapshot().wrathOn && s.getSnapshot().rage === 0);
  run(s, 4.5, [tank]);
  ok("гнев: метеоры попали по твари", tank.hp < 100000 - 100, `урон ${Math.round(100000 - tank.hp)}`);
  ok("гнев: дождь кончился", !s.getSnapshot().wrathOn && s.world.meteors.length === 0);
}
// 6. Бегун: рывок после первого удара
{
  const s = fresh();
  put(s, "archer", tc, tr);
  const runner = mk("runner", TX + 1.5, TY, { hp: 100000, maxHp: 100000, dashed: false });
  arena(s, runner);
  run(s, 0.6, [runner]);
  ok("бегун: после удара пошёл рывок", runner.dashed && runner.dashT > 0, `осталось ${runner.dashT.toFixed(2)} с`);
  run(s, 2, [runner]);
  ok("бегун: рывок один раз и кончается", runner.dashT === 0);
}
// 7. Латник: панцирь режет обычный урон, баллиста пробивает
{
  const dmg = (kind: TowerKind, shell: boolean) => {
    const s = fresh();
    put(s, kind, tc, tr);
    const husk = mk("husk", TX + 1.5, TY, { hp: 100000, maxHp: 100000, armor: 1, shellT: shell ? 99 : 0 });
    arena(s, husk);
    run(s, 6, [husk]);
    return 100000 - husk.hp;
  };
  const open = dmg("archer", false);
  const shut = dmg("archer", true);
  ok("панцирь: лук почти не пробивает", shut / open < 0.2 && shut > 0, `${open.toFixed(0)} → ${shut.toFixed(1)}`);
  const bOpen = dmg("ballista", false);
  const bShut = dmg("ballista", true);
  ok("панцирь: баллиста бьёт в полную силу", Math.abs(bShut - bOpen) < 1, `${bOpen.toFixed(0)} и ${bShut.toFixed(0)}`);
  const s = fresh();
  const husk = mk("husk", 3.5, 1.5, { speed: 1, shellCd: 0.2 });
  arena(s, husk);
  run(s, 0.5, [husk]);
  ok("панцирь: закрывается сам по времени", husk.shellT > 0, `${husk.shellT.toFixed(2)} с`);
}
// 8. Огонёк: на половине здоровья перескакивает вперёд один раз
{
  const s = fresh();
  put(s, "archer", tc, tr);
  const wisp = mk("wisp", 9.5, 7.5, { hp: 60, maxHp: 100, blinked: false, wpi: 6 });
  wisp.x = TX + 1;
  wisp.y = TY;
  arena(s, wisp);
  run(s, 2.5, [wisp]);
  ok("огонёк: мерцание сработало", wisp.blinked && Math.abs(wisp.travel - BLINK_DIST) < 0.01, `прошёл ${wisp.travel.toFixed(2)}`);
}
// 9. Таран: рёв глушит башни рядом, даёт рывок и зовёт бегунов
{
  const s = fresh();
  const tower = put(s, "ballista", tc, tr);
  const boss = mk("boss", TX + 1.5, TY, { hp: 700, maxHp: 1000, roars: 0, armor: 1 });
  arena(s, boss);
  let silenced = 0;
  for (let t = 0; t < 8 && boss.roars === 0; t += 0.1) {
    run(s, 0.1, [boss]);
    silenced = Math.max(silenced, tower.silenceT);
  }
  const runners = s.world.enemies.filter((e) => e.ownerId === boss.id && e.kind === "runner");
  ok("рёв: сработал на двух третях здоровья", boss.roars === 1 && boss.hp <= 660);
  ok("рёв: башня рядом оглохла", silenced > 1.5, `${silenced.toFixed(2)} с`);
  ok("рёв: вышли три бегуна, Таран рванул", runners.length === 3 && boss.dashT > 0);
}
// 10. Горнист: твари рядом идут быстрее, сам он — нет
{
  const s = fresh();
  const drummer = mk("drummer", 3.5, 1.5, { speed: 1 });
  const close = mk("mite", 3.0, 1.5, { speed: 1 });
  const far = mk("mite", 0.6, 1.5, { speed: 1 });
  arena(s, drummer, close, far);
  run(s, 1, [drummer, close, far]);
  ok("горнист: сосед ускорен", Math.abs(close.travel - HASTE_MULT) < 0.06, `прошёл ${close.travel.toFixed(2)}`);
  ok("горнист: дальний и сам горнист — нет", Math.abs(far.travel - 1) < 0.06 && Math.abs(drummer.travel - 1) < 0.06);
}
// 11. Тень: башни не видят, пока рядом нет Фонаря или её не задело
{
  const s = fresh();
  put(s, "archer", tc, tr);
  const shade = mk("shade", TX + 1.5, TY, { hp: 100000, maxHp: 100000, hidden: true });
  arena(s, shade);
  run(s, 3, [shade]);
  ok("тень: лук её не видит", shade.hp === 100000 && shade.hidden);
  s.toggleAim();
  s.pointer(Math.floor(shade.x), Math.floor(shade.y), "down", shade.x, shade.y);
  run(s, 0.7, [shade]);
  const afterRock = shade.hp;
  ok("тень: обвал задел и раскрыл", afterRock < 100000 && !shade.hidden);
  run(s, 2, [shade]);
  ok("тень: раскрытую лук бьёт", shade.hp < afterRock);
  // без башен: раскрытая обвалом Тень через 3 с снова прячется
  const s1 = fresh();
  const lone = mk("shade", 12.5, 3.5, { hp: 100000, maxHp: 100000, hidden: true });
  arena(s1, lone);
  s1.toggleAim();
  s1.pointer(12, 3, "down", 12.5, 3.5);
  run(s1, 1, [lone]);
  ok("тень: после обвала видна", !lone.hidden && lone.reveal > 0);
  run(s1, 3, [lone]);
  ok("тень: через 3 с без попаданий снова скрыта", lone.hidden);

  const s2 = fresh();
  put(s2, "archer", tc, tr);
  const [fc, fr] = near(tc + 2, tr, [[tc, tr]]);
  put(s2, "frost", fc, fr);
  const shade2 = mk("shade", fc + 0.5 + 1, fr + 0.5, { hp: 100000, maxHp: 100000, hidden: true });
  arena(s2, shade2);
  run(s2, 2, [shade2]);
  ok("тень: рядом с Фонарём видна и получает урон", !shade2.hidden && shade2.hp < 100000);
}
// 12. Элитные: заживающая лечится, взрывная глушит башни при гибели, шанс по волне
{
  const s = fresh();
  const tower = put(s, "archer", tc, tr);
  const regen = mk("husk", 3.5, 9.5, { hp: 500, maxHp: 1000, elite: "regen" });
  const bomb = mk("mite", TX + 1.2, TY, { hp: 1, maxHp: 1, elite: "volatile" });
  arena(s, regen, bomb);
  let silenced = 0;
  for (let t = 0; t < 2; t += 0.1) {
    run(s, 0.1, [regen, bomb]);
    silenced = Math.max(silenced, tower.silenceT);
  }
  ok("элитная: заживающая лечится", regen.hp > 530, `hp ${Math.round(regen.hp)}`);
  ok("элитная: взрывная при гибели глушит башню", !bomb.alive && silenced > 1, `${silenced.toFixed(2)} с`);
  ok("элитная: до 8-й волны не выходят, потом выходят", eliteChance(6, "normal") === 0 && eliteChance(7, "normal") > 0 && eliteChance(40, "hard") <= 0.22);
}
// 13. Башня без цели не копит выстрелы
{
  const s = fresh();
  put(s, "archer", tc, tr);
  arena(s);
  run(s, 6, []);
  const dummy = mk("mite", TX + 1.5, TY, { hp: 100000, maxHp: 100000 });
  s.world.enemies.push(dummy);
  run(s, 0.3, [dummy]);
  const shots = (100000 - dummy.hp) / TOWERS.archer.damage;
  ok("башня: после простоя один выстрел, а не очередь", shots <= 1.01, `выстрелов ${shots.toFixed(1)}`);
}
// 14. Дары: выбор после третьей волны, действие, сохранение и старый сейв
{
  const s = fresh();
  const spots: Array<[number, number]> = [];
  for (let i = 0; i < 8; i++) {
    const spot = near(6, 3, spots);
    spots.push(spot);
    put(s, "ballista", spot[0], spot[1]);
  }
  let perkAt = 0;
  for (let t = 0; t < 400 && !perkAt; t++) {
    const hud = s.getSnapshot();
    if (hud.perk) perkAt = hud.cleared;
    else if (hud.event) s.chooseEvent(1);
    else if (hud.phase === "prep") s.callWave();
    s.simulate(0.5);
  }
  const hud = s.getSnapshot();
  ok("дары: выбор открылся после третьей волны", perkAt === 3 && hud.perk?.options.length === 3, `после волны ${perkAt}`);
  s.callWave();
  ok("дары: волна не идёт, пока дар не выбран", s.getSnapshot().phase === "prep");
  const taken = hud.perk!.options[0]!.id;
  s.choosePerk(0);
  const after = s.getSnapshot();
  ok("дары: выбранный дар взят, выбор закрыт", after.perk === null && after.perks.some((p) => p.id === taken));

  // сохранённый забег с дарами и невыбранным даром
  store.clear();
  store.set(
    "pepelny-dozor-run-v1",
    JSON.stringify({
      v: 1, map: "ash", difficulty: "normal", endless: false, cheated: false, wave: 3, gold: 500, lives: 10, cleared: 3,
      killed: 40, leaked: 0, abilityCd: 0, perks: ["discount", "gates", "нет такого"], perkDue: true, rage: 33,
      towers: [{ kind: "archer", col: tc, row: tr, dmgRank: 1, rateRank: 0, spent: 100, target: "first", spec: null }],
    }),
  );
  const s2 = createSim();
  s2.loadProgress();
  s2.continueRun();
  const h2 = s2.getSnapshot();
  ok("сейв: дары восстановлены, мусор отброшен", h2.perks.length === 2 && h2.rage === 33, `даров ${h2.perks.length}`);
  ok("сейв: невыбранный дар предложен снова, без уже взятых", h2.perk?.options.length === 3 && !h2.perk.options.some((o) => o.id === "discount" || o.id === "gates"));
  ok("дар «Свой кузнец»: башни дешевле", h2.towerCost.archer === Math.round(TOWERS.archer.cost * PERK_DISCOUNT), `лук ${h2.towerCost.archer}`);

  // старый сейв без новых полей
  store.clear();
  store.set(
    "pepelny-dozor-run-v1",
    JSON.stringify({
      v: 1, map: "twin", difficulty: "hard", endless: false, cheated: false, wave: 5, gold: 300, lives: 7, cleared: 5,
      killed: 90, leaked: 3, abilityCd: 10, freezeCd: 20,
      towers: [{ kind: "tesla", col: 3, row: 3, dmgRank: 3, rateRank: 0, spent: 700, target: "strong", spec: "storm" }],
    }),
  );
  const s3 = createSim();
  s3.loadProgress();
  s3.continueRun();
  const h3 = s3.getSnapshot();
  ok("старый сейв: грузится без даров и гнева", h3.phase === "prep" && h3.perks.length === 0 && h3.rage === 0 && h3.perk === null && h3.towerCount === 1);
  s3.callWave();
  s3.simulate(3);
  ok("старый сейв: бой идёт", s3.getSnapshot().phase === "combat");
}

// 15. Протяжка: выбранная башня встаёт в каждую свободную клетку, тропу и занятые клетки молча пропускает
{
  const s = fresh();
  s.selectBuild("archer");
  const cells: Array<[number, number]> = [];
  for (let c = 0; c < 8; c++) cells.push([c, 0]);
  for (const [c, r] of cells) s.pointer(c, r, "drag");
  const placed = s.world.towers.length;
  const onRoad = cells.filter(([c, r]) => isRoad(map, c, r)).length;
  ok("протяжка: башни встали во все клетки не на тропе", placed === cells.length - onRoad && placed > 0, `${placed} башен, на тропе ${onRoad} клеток`);
  for (const [c, r] of cells) s.pointer(c, r, "drag");
  ok("протяжка: повторный проход ничего не ломает", s.world.towers.length === placed);
  ok("протяжка: выбранная башня остаётся в руке", s.getSnapshot().build === "archer");
  const poor = createSim();
  poor.start();
  poor.selectBuild("archer");
  for (let c = 0; c < 18; c++) poor.pointer(c, 10, "drag");
  const afford = Math.floor(poor.getSnapshot().goldTotal / poor.getSnapshot().towerCost.archer);
  ok("протяжка: останавливается, когда кончилось золото", poor.world.towers.length <= afford && poor.getSnapshot().gold >= 0, `${poor.world.towers.length} из ${afford} возможных`);
  const idle = fresh();
  idle.pointer(2, 0, "drag");
  ok("протяжка: без выбранной башни ничего не ставит", idle.world.towers.length === 0);
}
// 16. «Всё на максимум»: все ранги, золото списано, повторно нечего прокачивать
{
  const s = fresh();
  put(s, "archer", 0, 0);
  put(s, "ballista", 1, 0);
  put(s, "banner", 2, 0);
  const before = s.getSnapshot().maxAll;
  ok("максимум: кнопка знает, сколько шагов осталось (12 рангов и 3 мастерства)", before.steps === 15, `${before.steps} шагов за ${before.cost}`);
  s.upgradeAll();
  const rows = s.world.towers.filter((t) => TOWERS[t.kind].aura === 0);
  ok("максимум: у стреляющих башен все ранги 3/3", rows.every((t) => t.dmgRank === 3 && t.rateRank === 3));
  ok("максимум: у каждой башни, включая Знамя, выбрана ветка мастерства", s.world.towers.every((t) => t.spec !== null && SPECS[t.kind].some((d) => d.id === t.spec)));
  ok("максимум: после этого нечего прокачивать", s.getSnapshot().maxAll.steps === 0);
  const poor = createSim();
  poor.start();
  put(poor, "archer", 0, 0);
  poor.dismiss();
  const g0 = poor.getSnapshot().gold;
  poor.upgradeAll();
  const hud = poor.getSnapshot();
  const t = poor.world.towers[0]!;
  ok("максимум: без чита покупает, пока хватает золота и не уходит в минус", g0 - hud.gold > 0 && hud.gold >= 0 && t.dmgRank + t.rateRank > 0, `золото ${g0} → ${hud.gold}, ранги ${t.dmgRank}+${t.rateRank}`);
}

console.log(bad ? `\nОШИБОК: ${bad}` : "\nвсе проверки обновления прошли");
if (bad) process.exit(1);
