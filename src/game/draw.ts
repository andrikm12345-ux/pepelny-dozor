import { ABILITY_RADIUS, COLS, ENEMIES, ROWS, SPEC_BY_ID, TOWERS, gateOf, isRoad, type GameMap, type Waypoint } from "./balance";
import type { Bolt, Creep, Shot, Tower, World } from "./sim";

export interface Board {
  cell: number;
  ox: number;
  oy: number;
}

export function boardLayout(width: number, height: number): Board {
  const margin = 12;
  const cell = Math.max(8, Math.min((width - margin * 2) / COLS, (height - margin * 2) / ROWS));
  return {
    cell,
    ox: (width - cell * COLS) / 2,
    oy: (height - cell * ROWS) / 2,
  };
}

export interface Renderer {
  render(
    ctx: CanvasRenderingContext2D,
    world: World,
    sprites: Record<string, HTMLImageElement>,
    width: number,
    height: number,
    reduceMotion: boolean,
  ): void;
}

type Pt = { x: number; y: number };

/** Ночь: насколько темнеет поле там, где нет света. */
const DARKNESS = 0.52;
/** Карта света считается в половинном разрешении — на телефоне это заметно дешевле. */
const LIGHT_SCALE = 0.5;

const TRAIL_LEN: Record<string, number> = { archer: 5, ember: 9, frost: 6, ballista: 10 };

function hash(col: number, row: number, salt = 0): number {
  const n = Math.abs(Math.sin(col * 12.9898 + row * 78.233 + salt * 37.719) * 43758.5453);
  return n - Math.floor(n);
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function easeOutBack(t: number) {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function strokePath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.stroke();
}

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
}

/** Лента тропы: от портала чуть за край поля до врат. */
function pathRibbon({ cell, ox, oy }: Board, points: Waypoint[]): Pt[] {
  const pts = points.map((point) => ({ x: ox + point.x * cell, y: oy + point.y * cell }));
  const first = pts[0]!;
  const second = pts[1] ?? first;
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2] ?? last;
  const enter = Math.hypot(second.x - first.x, second.y - first.y) || 1;
  const exit = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
  return [
    {
      x: first.x - ((second.x - first.x) / enter) * cell * 0.85,
      y: first.y - ((second.y - first.y) / enter) * cell * 0.85,
    },
    ...pts,
    {
      x: last.x + ((last.x - prev.x) / exit) * cell * 0.35,
      y: last.y + ((last.y - prev.y) / exit) * cell * 0.35,
    },
  ];
}

interface Mote {
  u: number;
  v: number;
  vx: number;
  vy: number;
  size: number;
  ember: boolean;
  phase: number;
}

interface Fog {
  u: number;
  v: number;
  r: number;
  speed: number;
}

export function createRenderer(): Renderer {
  let ground: HTMLCanvasElement | null = null;
  let groundKey = "";
  let shade: HTMLCanvasElement | null = null;
  let shadeKey = "";
  let light: HTMLCanvasElement | null = null;
  const glows = new Map<string, HTMLCanvasElement>();
  const trails = new WeakMap<Shot, Pt[]>();
  let lastAnim = -1;

  const motes: Mote[] = Array.from({ length: 48 }, (_, i) => {
    const ember = i % 4 === 0;
    return {
      u: hash(i, 1),
      v: hash(i, 2),
      vx: (hash(i, 3) - 0.3) * 0.012,
      vy: ember ? -(0.01 + hash(i, 4) * 0.02) : 0.006 + hash(i, 4) * 0.012,
      size: ember ? 1.2 + hash(i, 5) * 1.4 : 0.8 + hash(i, 5) * 1.6,
      ember,
      phase: hash(i, 6) * Math.PI * 2,
    };
  });
  const fog: Fog[] = Array.from({ length: 6 }, (_, i) => ({
    u: hash(i, 11),
    v: 0.15 + hash(i, 12) * 0.7,
    r: 2.6 + hash(i, 13) * 2.4,
    speed: 0.004 + hash(i, 14) * 0.006,
  }));

  /** Мягкое пятно цвета: рисуется один раз, потом только масштабируется. */
  function glow(color: string) {
    let canvas = glows.get(color);
    if (canvas) return canvas;
    canvas = makeCanvas(64, 64);
    const g = canvas.getContext("2d")!;
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 64);
    // прозрачность задаёт отдельная маска — так у края нет тёмной каймы
    const fade = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(0.3, "rgba(0,0,0,0.75)");
    fade.addColorStop(0.65, "rgba(0,0,0,0.22)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-in";
    g.fillStyle = fade;
    g.fillRect(0, 0, 64, 64);
    glows.set(color, canvas);
    return canvas;
  }

  function blot(
    ctx: CanvasRenderingContext2D,
    color: string,
    x: number,
    y: number,
    radius: number,
    alpha: number,
  ) {
    if (alpha <= 0.01 || radius <= 0) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(glow(color), x - radius, y - radius, radius * 2, radius * 2);
  }

  /** Неподвижная часть: камень, трещины, мох, тропа. Перерисовывается только при смене размера. */
  function buildGround(width: number, height: number, dpr: number, map: GameMap) {
    const board = boardLayout(width, height);
    const { cell, ox, oy } = board;
    const canvas = makeCanvas(width * dpr, height * dpr);
    const g = canvas.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sky = g.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#131b17");
    sky.addColorStop(1, "#080c0a");
    g.fillStyle = sky;
    g.fillRect(0, 0, width, height);

    // пыль на фоне за полем
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(200, 220, 205, ${0.015 + hash(i, 31) * 0.03})`;
      g.fillRect(hash(i, 32) * width, hash(i, 33) * height, 1.2, 1.2);
    }

    // подложка под поле
    g.fillStyle = "#0e1411";
    round(g, ox - cell * 0.12, oy - cell * 0.12, cell * COLS + cell * 0.24, cell * ROWS + cell * 0.24, cell * 0.3);
    g.fill();
    g.strokeStyle = "rgba(226, 177, 90, 0.12)";
    g.lineWidth = 1;
    g.stroke();

    const gap = Math.max(1, cell * 0.06);
    const radius = Math.max(2, cell * 0.14);
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (isRoad(map, col, row)) continue;
        const n = hash(col, row);
        const x = ox + col * cell + gap;
        const y = oy + row * cell + gap;
        const s = cell - gap * 2;
        const tone = n > 0.5 ? [30, 41, 36] : [35, 47, 41];
        const stone = g.createLinearGradient(x, y, x, y + s);
        stone.addColorStop(0, `rgb(${tone[0] + 8}, ${tone[1] + 9}, ${tone[2] + 8})`);
        stone.addColorStop(1, `rgb(${tone[0] - 6}, ${tone[1] - 7}, ${tone[2] - 6})`);
        g.fillStyle = stone;
        round(g, x, y, s, s, radius);
        g.fill();
        // светлая кромка сверху и тёмная снизу — камень выпуклый
        g.strokeStyle = "rgba(255, 255, 255, 0.05)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x + radius, y + 0.5);
        g.lineTo(x + s - radius, y + 0.5);
        g.stroke();
        g.strokeStyle = "rgba(0, 0, 0, 0.35)";
        g.beginPath();
        g.moveTo(x + radius, y + s - 0.5);
        g.lineTo(x + s - radius, y + s - 0.5);
        g.stroke();

        // зернистость
        for (let k = 0; k < 5; k++) {
          g.fillStyle = hash(col * 7 + k, row, 3) > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.12)";
          g.fillRect(x + hash(col, row * 5 + k, 4) * s, y + hash(col * 3 + k, row, 5) * s, 1.5, 1.5);
        }
        // трещины
        if (hash(col, row, 6) > 0.62) {
          g.strokeStyle = "rgba(0, 0, 0, 0.4)";
          g.lineWidth = Math.max(1, cell * 0.025);
          g.beginPath();
          let cx = x + s * (0.2 + hash(col, row, 7) * 0.6);
          let cy = y + s * 0.15;
          g.moveTo(cx, cy);
          for (let k = 0; k < 3; k++) {
            cx += (hash(col + k, row, 8) - 0.5) * s * 0.35;
            cy += s * (0.18 + hash(col, row + k, 9) * 0.12);
            g.lineTo(cx, cy);
          }
          g.stroke();
        }
        // мох у края
        if (n > 0.86) {
          g.fillStyle = "rgba(126, 174, 138, 0.22)";
          for (let k = 0; k < 4; k++) {
            g.beginPath();
            g.ellipse(
              x + s * (0.15 + hash(col, row, 20 + k) * 0.5),
              y + s * (0.72 + hash(col, row, 24 + k) * 0.2),
              s * (0.06 + hash(col, row, 28 + k) * 0.06),
              s * 0.04,
              0,
              0,
              Math.PI * 2,
            );
            g.fill();
          }
        }
      }
    }

    // слоями по всем тропам сразу, чтобы место слияния не перечёркивало само себя
    const ribbons = map.routes.map((points) => pathRibbon(board, points));
    g.lineCap = "round";
    g.lineJoin = "round";
    const layers: Array<[string, number]> = [
      ["#140d09", 1.0],
      ["#3f2c22", 0.78],
      ["#5a4031", 0.48],
      ["rgba(255, 220, 170, 0.05)", 0.18],
    ];
    for (const [color, widthK] of layers) {
      g.strokeStyle = color;
      g.lineWidth = cell * widthK;
      for (const ribbon of ribbons) strokePath(g, ribbon);
    }

    // булыжники и колеи вдоль тропы
    const segments = ribbons.flatMap((ribbon) => ribbon.slice(1).map((b, i) => [ribbon[i]!, b] as const));
    for (let i = 0; i < segments.length; i++) {
      const [a, b] = segments[i]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.floor(len / (cell * 0.22));
      const nx = -(b.y - a.y) / (len || 1);
      const ny = (b.x - a.x) / (len || 1);
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const side = (hash(i, k, 40) - 0.5) * cell * 0.62;
        const px = a.x + (b.x - a.x) * t + nx * side;
        const py = a.y + (b.y - a.y) * t + ny * side;
        const r = cell * (0.03 + hash(i, k, 41) * 0.045);
        g.fillStyle = hash(i, k, 42) > 0.5 ? "rgba(120, 92, 70, 0.55)" : "rgba(28, 18, 12, 0.5)";
        g.beginPath();
        g.ellipse(px, py, r * 1.3, r, hash(i, k, 43) * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    }
    return canvas;
  }

  /** Виньетка: тёмные края кадра. */
  function buildShade(width: number, height: number) {
    const canvas = makeCanvas(width, height);
    const g = canvas.getContext("2d")!;
    const r = Math.hypot(width, height) / 2;
    const grad = g.createRadialGradient(width / 2, height / 2, r * 0.45, width / 2, height / 2, r);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = grad;
    g.fillRect(0, 0, width, height);
    return canvas;
  }

  function drawSprite(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement | undefined,
    x: number,
    y: number,
    size: number,
    flip: boolean,
    sy = 1,
    tilt = 0,
  ) {
    if (!img || !img.complete || img.naturalWidth === 0) return false;
    ctx.save();
    ctx.translate(x, y + (size * (1 - sy)) / 2);
    if (tilt) ctx.rotate(tilt);
    ctx.scale(flip ? -1 : 1, sy);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
    return true;
  }

  function towerCenter(tower: Tower, board: Board) {
    return {
      x: board.ox + (tower.col + 0.5) * board.cell,
      y: board.oy + (tower.row + 0.5) * board.cell,
    };
  }

  function enemyPos(enemy: Creep, board: Board, anim: number) {
    const bob = enemy.flying
      ? Math.sin(anim * 4 + enemy.id) * board.cell * 0.08
      : Math.abs(Math.sin(anim * 7 + enemy.id)) * -board.cell * 0.04;
    return { x: board.ox + enemy.x * board.cell, y: board.oy + enemy.y * board.cell + bob };
  }

  function render(
    ctx: CanvasRenderingContext2D,
    world: World,
    sprites: Record<string, HTMLImageElement>,
    width: number,
    height: number,
    reduceMotion: boolean,
  ) {
    const board = boardLayout(width, height);
    const { cell, ox, oy } = board;
    const anim = reduceMotion ? 0 : world.anim;
    const dt = lastAnim < 0 ? 0 : Math.max(0, Math.min(0.05, world.anim - lastAnim));
    lastAnim = world.anim;
    const dpr = ctx.getTransform().a || 1;

    const key = `${width}x${height}@${dpr}`;
    const groundFor = `${key}:${world.map.def.id}`;
    if (!ground || groundKey !== groundFor) {
      ground = buildGround(width, height, dpr, world.map);
      groundKey = groundFor;
    }
    if (!shade || shadeKey !== key) {
      shade = buildShade(width, height);
      shadeKey = key;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    if (!reduceMotion && world.shake > 0.02) {
      const mag = world.shake * cell * 0.22;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }
    ctx.drawImage(ground, 0, 0, width, height);

    const ribbons = world.map.routes.map((points) => pathRibbon(board, points));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(226, 177, 90, 0.22)";
    ctx.lineWidth = Math.max(1, cell * 0.05);
    ctx.setLineDash([cell * 0.22, cell * 0.55]);
    ctx.lineDashOffset = -anim * cell * 0.55;
    for (const ribbon of ribbons) strokePath(ctx, ribbon);
    ctx.setLineDash([]);

    // пепельные следы
    for (const decal of world.decals) {
      const fade = clamp01(decal.life / decal.max);
      const x = ox + decal.x * cell;
      const y = oy + decal.y * cell;
      const r = cell * 0.32 * decal.size;
      ctx.globalAlpha = 0.55 * Math.min(1, fade * 2.5);
      ctx.fillStyle = "#0b0907";
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.3, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      if (fade > 0.6) {
        ctx.globalAlpha = (fade - 0.6) * 2;
        ctx.fillStyle = "#e25b3a";
        for (let k = 0; k < 3; k++) {
          ctx.fillRect(x + (hash(decal.x * 10, k) - 0.5) * r, y + r * 0.3 + (hash(decal.y * 10, k) - 0.5) * r * 0.5, 1.5, 1.5);
        }
      }
    }
    ctx.globalAlpha = 1;

    // горящая земля после Пекла
    if (world.fires.length) {
      ctx.globalCompositeOperation = "lighter";
      for (const fire of world.fires) {
        const k = clamp01(fire.life / fire.max);
        const x = ox + fire.x * cell;
        const y = oy + fire.y * cell;
        const flick = 0.85 + Math.sin(anim * 11 + fire.x * 7 + fire.y * 5) * 0.15;
        blot(ctx, "rgba(255, 110, 40, 1)", x, y, fire.radius * cell * 1.05 * flick, 0.5 * Math.min(1, k * 2.5));
        blot(ctx, "rgba(255, 200, 90, 1)", x, y, fire.radius * cell * 0.55 * flick, 0.4 * Math.min(1, k * 2.5));
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    // туман над землёй
    for (const blob of fog) {
      if (!reduceMotion) blob.u = (blob.u + blob.speed * dt + 1.2) % 1.2;
      blot(ctx, "rgba(150, 175, 160, 1)", (blob.u - 0.1) * width, blob.v * height, blob.r * cell, 0.05);
    }
    ctx.globalAlpha = 1;

    for (const ribbon of ribbons) drawPortal(ctx, ribbon[1]!.x, ribbon[1]!.y, cell, anim);
    const gate = gateOf(world.map);
    drawGate(ctx, ox + gate.x * cell, oy + gate.y * cell, cell, anim);

    // башни сверху вниз, чтобы нижние перекрывали верхние
    const towers = [...world.towers].sort((a, b) => a.row - b.row);
    for (const tower of towers) drawTower(ctx, tower, board, sprites, world, reduceMotion);

    const ordered = world.enemies.filter((enemy) => enemy.alive).sort((a, b) => a.y - b.y);
    for (const enemy of ordered) drawEnemy(ctx, enemy, board, sprites, anim);

    drawShots(ctx, world, board);
    for (const bolt of world.bolts) drawBolt(ctx, bolt, board);

    for (const ring of world.rings) {
      const t = 1 - clamp01(ring.life / ring.max);
      const r = (ring.from + (ring.to - ring.from) * (1 - Math.pow(1 - t, 3))) * cell;
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = Math.max(1, cell * 0.1 * (1 - t));
      ctx.beginPath();
      ctx.arc(ox + ring.x * cell, oy + ring.y * cell, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    drawLighting(ctx, world, board, width, height, anim);

    // вспышка Заморозки: холодный свет по всему полю
    if (world.freezeT > 0) {
      const k = clamp01(world.freezeT / 0.9);
      const grad = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.7);
      grad.addColorStop(0, `rgba(190, 230, 255, ${0.1 * k})`);
      grad.addColorStop(1, `rgba(120, 190, 240, ${0.35 * k})`);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
    }

    // искры и осколки поверх света — они сами светятся
    ctx.globalCompositeOperation = "lighter";
    for (const particle of world.particles) {
      const alpha = Math.max(0, particle.life / particle.max);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(ox + particle.x * cell, oy + particle.y * cell, particle.size * cell, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    drawOverlays(ctx, world, board);
    for (const enemy of ordered) drawHealth(ctx, enemy, board, anim);

    // пепел и угольки в воздухе
    for (const mote of motes) {
      if (!reduceMotion) {
        mote.u = (mote.u + mote.vx * dt + Math.sin(world.anim * 0.6 + mote.phase) * 0.0006 + 1) % 1;
        mote.v = (mote.v + mote.vy * dt + 1) % 1;
      }
      const x = mote.u * width;
      const y = mote.v * height;
      if (mote.ember) {
        const flicker = 0.45 + Math.sin(world.anim * 5 + mote.phase) * 0.35;
        ctx.globalCompositeOperation = "lighter";
        blot(ctx, "rgba(255, 140, 70, 1)", x, y, mote.size * 3, flicker * 0.5);
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = "#b9c2bb";
        ctx.fillRect(x, y, mote.size, mote.size);
      }
    }
    ctx.globalAlpha = 1;

    ctx.font = `700 ${Math.max(12, cell * 0.32)}px Manrope, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    for (const floater of world.floaters) {
      const fx = ox + floater.x * cell;
      const fy = oy + floater.y * cell;
      ctx.globalAlpha = Math.max(0, Math.min(1, (floater.life / floater.max) * 1.6));
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(8, 10, 9, 0.85)";
      ctx.strokeText(floater.text, fx, fy);
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, fx, fy);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    drawBossBar(ctx, world, width);

    ctx.drawImage(shade, 0, 0, width, height);
    if (world.hurt > 0.02) drawHurt(ctx, width, height, world.hurt);
  }

  function drawHurt(ctx: CanvasRenderingContext2D, width: number, height: number, hurt: number) {
    const r = Math.hypot(width, height) / 2;
    const grad = ctx.createRadialGradient(width / 2, height / 2, r * 0.35, width / 2, height / 2, r);
    grad.addColorStop(0, "rgba(226, 91, 58, 0)");
    grad.addColorStop(1, `rgba(226, 91, 58, ${0.55 * hurt})`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  function drawTower(
    ctx: CanvasRenderingContext2D,
    tower: Tower,
    board: Board,
    sprites: Record<string, HTMLImageElement>,
    world: World,
    reduceMotion: boolean,
  ) {
    const { cell } = board;
    const def = TOWERS[tower.kind];
    const { x, y } = towerCenter(tower, board);
    const grow = reduceMotion ? 1 : easeOutBack(clamp01((world.anim - tower.born) / 0.4));
    const kick = tower.recoil * cell * 0.06;
    const bx = x - Math.cos(tower.angle) * kick;
    const by = y - Math.sin(tower.angle) * kick;
    const size = cell * 1.22 * grow;
    const ranks = tower.dmgRank + tower.rateRank;

    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.ellipse(x, y + cell * 0.36, cell * 0.36 * grow, cell * 0.12 * grow, 0, 0, Math.PI * 2);
    ctx.fill();
    if (def.aura > 0) {
      ctx.strokeStyle = def.shot;
      ctx.globalAlpha = 0.22 + Math.sin(world.anim * 2) * 0.06;
      ctx.lineWidth = Math.max(1, cell * 0.04);
      ctx.setLineDash([cell * 0.2, cell * 0.2]);
      ctx.lineDashOffset = -world.anim * cell * 0.15;
      ctx.beginPath();
      ctx.arc(x, y, def.aura * cell, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    const specColor = tower.spec ? SPEC_BY_ID[tower.spec].color : null;
    if (ranks > 0 || specColor) {
      ctx.strokeStyle = specColor ?? def.shot;
      ctx.globalAlpha = specColor ? 0.75 : 0.2 + ranks * 0.1;
      ctx.lineWidth = Math.max(1, cell * 0.04);
      ctx.beginPath();
      ctx.ellipse(x, y + cell * 0.36, cell * 0.42, cell * 0.15, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (!drawSprite(ctx, sprites[tower.kind], bx, by, size, false)) {
      fallbackTower(ctx, bx, by, cell * 0.42 * grow, def.shot);
    }

    // ствол смотрит на цель
    if (def.damage > 0 && tower.kind !== "tesla") {
      const ax = bx + Math.cos(tower.angle) * cell * 0.46;
      const ay = by + Math.sin(tower.angle) * cell * 0.46;
      ctx.strokeStyle = def.shot;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = Math.max(2, cell * 0.06);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(tower.angle) * cell * 0.18, by + Math.sin(tower.angle) * cell * 0.18);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // значок мастерства: звёздочка цвета ветки над башней
    if (specColor) {
      const sx = x + cell * 0.32;
      const sy = y - cell * 0.4;
      const outer = cell * 0.13;
      const inner = outer * 0.45;
      ctx.fillStyle = specColor;
      ctx.strokeStyle = "rgba(10, 8, 6, 0.85)";
      ctx.lineWidth = Math.max(1, cell * 0.025);
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 4;
        const rr = k % 2 === 0 ? outer : inner;
        const px2 = sx + Math.cos(a) * rr;
        const py2 = sy + Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(px2, py2);
        else ctx.lineTo(px2, py2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // уровни: золотые — урон, голубые — скорострельность
    const pip = Math.max(2, cell * 0.06);
    const total = tower.dmgRank + tower.rateRank;
    let px = x - ((total - 1) * pip * 2.2) / 2;
    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i < tower.dmgRank ? "#e2b15a" : "#9ec4d4";
      ctx.beginPath();
      ctx.moveTo(px, y + cell * 0.5 - pip);
      ctx.lineTo(px + pip, y + cell * 0.5);
      ctx.lineTo(px, y + cell * 0.5 + pip);
      ctx.lineTo(px - pip, y + cell * 0.5);
      ctx.closePath();
      ctx.fill();
      px += pip * 2.2;
    }
  }

  function drawEnemy(
    ctx: CanvasRenderingContext2D,
    enemy: Creep,
    board: Board,
    sprites: Record<string, HTMLImageElement>,
    anim: number,
  ) {
    const { cell } = board;
    const { x, y } = enemyPos(enemy, board, anim);
    const size = cell * enemy.scale * 1.12;
    const groundY = board.oy + enemy.y * cell;

    ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
    ctx.beginPath();
    ctx.ellipse(x, groundY + size * 0.32, size * 0.26, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    if (enemy.kind === "healer") {
      ctx.globalCompositeOperation = "lighter";
      blot(ctx, "rgba(125, 255, 150, 1)", x, y, size * 0.75, 0.28 + Math.sin(anim * 5 + enemy.id) * 0.1);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    if (enemy.kind === "summoner") {
      ctx.globalCompositeOperation = "lighter";
      blot(ctx, "rgba(183, 140, 255, 1)", x, y, size * 0.8, 0.3 + Math.sin(anim * 3 + enemy.id) * 0.1);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    if (enemy.kind === "boss") {
      ctx.globalCompositeOperation = "lighter";
      blot(ctx, "rgba(226, 91, 58, 1)", x, y, size * 0.9, 0.35 + Math.sin(anim * 4) * 0.12);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    const flip = enemy.vx < -0.2;
    const squash = enemy.flying ? 1 : 1 + Math.sin(anim * 14 + enemy.id) * 0.04;
    const tilt = enemy.flying ? 0 : Math.sin(anim * 7 + enemy.id) * 0.05;
    if (!drawSprite(ctx, sprites[enemy.kind], x, y, size, flip, squash, tilt)) {
      fallbackCreep(ctx, x, y, size * 0.32, enemy.color);
    }
    if (enemy.shield > 0) {
      // щит дугой спереди; ударов осталось — столько насечек
      const max = ENEMIES.shield.shield ?? 4;
      const face = Math.hypot(enemy.vx, enemy.vy) > 0.01 ? Math.atan2(enemy.vy, enemy.vx) : 0;
      ctx.strokeStyle = `rgba(165, 210, 245, ${0.45 + 0.12 * enemy.shield})`;
      ctx.lineWidth = Math.max(2, cell * 0.08);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(x, y, size * 0.5, face - 1.05, face + 1.05);
      ctx.stroke();
      ctx.strokeStyle = "rgba(235, 248, 255, 0.9)";
      ctx.lineWidth = Math.max(1, cell * 0.035);
      for (let k = 0; k < enemy.shield; k++) {
        const a = face - 0.7 + (k * 1.4) / Math.max(1, max - 1);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * size * 0.43, y + Math.sin(a) * size * 0.43);
        ctx.lineTo(x + Math.cos(a) * size * 0.57, y + Math.sin(a) * size * 0.57);
        ctx.stroke();
      }
    }
    if (enemy.brittleT > 0) {
      ctx.strokeStyle = "rgba(217, 200, 255, 0.9)";
      ctx.lineWidth = Math.max(1, cell * 0.03);
      for (let k = 0; k < 3; k++) {
        const a = anim * 0.6 + k * 2.1 + enemy.id;
        const cx2 = x + Math.cos(a) * size * 0.3;
        const cy2 = y + Math.sin(a) * size * 0.22;
        ctx.beginPath();
        ctx.moveTo(cx2 - 3, cy2 - 3);
        ctx.lineTo(cx2 + 3, cy2 + 3);
        ctx.moveTo(cx2 + 3, cy2 - 3);
        ctx.lineTo(cx2 - 3, cy2 + 3);
        ctx.stroke();
      }
    }
    if (enemy.iceT > 0) {
      // льдина: полупрозрачный блок с бликом
      const half = size * 0.34;
      ctx.fillStyle = "rgba(170, 225, 255, 0.45)";
      ctx.strokeStyle = "rgba(235, 248, 255, 0.95)";
      ctx.lineWidth = Math.max(1.5, cell * 0.04);
      ctx.beginPath();
      ctx.moveTo(x - half, y - half * 0.55);
      ctx.lineTo(x - half * 0.4, y - half * 1.15);
      ctx.lineTo(x + half * 0.7, y - half * 0.95);
      ctx.lineTo(x + half, y + half * 0.5);
      ctx.lineTo(x + half * 0.2, y + half * 1.05);
      ctx.lineTo(x - half * 0.8, y + half * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - half * 0.5, y - half * 0.4);
      ctx.lineTo(x - half * 0.1, y - half * 0.8);
      ctx.stroke();
    } else if (enemy.stun > 0) {
      ctx.fillStyle = "#ffe08a";
      for (let k = 0; k < 3; k++) {
        const a = anim * 7 + (k * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * size * 0.28, y - size * 0.5 + Math.sin(a) * size * 0.08, Math.max(1.5, cell * 0.04), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (enemy.slowT > 0) {
      blot(ctx, "rgba(158, 196, 212, 1)", x, y, size * 0.5, 0.45);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#cfe7f0";
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        const a = anim * 1.5 + (k * Math.PI * 2) / 3;
        const sx = x + Math.cos(a) * size * 0.36;
        const sy = y + Math.sin(a) * size * 0.2;
        ctx.beginPath();
        ctx.moveTo(sx - 2.5, sy);
        ctx.lineTo(sx + 2.5, sy);
        ctx.moveTo(sx, sy - 2.5);
        ctx.lineTo(sx, sy + 2.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (enemy.flash > 0) {
      ctx.globalCompositeOperation = "lighter";
      blot(ctx, "rgba(255, 246, 234, 1)", x, y, size * 0.45, Math.min(0.9, enemy.flash * 6));
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  }

  function drawHealth(ctx: CanvasRenderingContext2D, enemy: Creep, board: Board, anim: number) {
    if (enemy.kind === "boss" || enemy.hp >= enemy.maxHp) return;
    const { cell } = board;
    const { x, y } = enemyPos(enemy, board, anim);
    const size = cell * enemy.scale * 1.12;
    const w = Math.max(cell * 0.55, size * 0.62);
    const h = Math.max(3, cell * 0.08);
    const pct = Math.max(0, enemy.hp / enemy.maxHp);
    const bx = x - w / 2;
    const by = y - size * 0.55;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    round(ctx, bx - 1, by - 1, w + 2, h + 2, h);
    ctx.fill();
    ctx.fillStyle = pct > 0.45 ? "#7eae8a" : pct > 0.2 ? "#e2b15a" : "#e25b3a";
    round(ctx, bx, by, Math.max(h, w * pct), h, h);
    ctx.fill();
  }

  /** Молния: рваная ломаная, которая мерцает, пока гаснет. */
  function drawBolt(ctx: CanvasRenderingContext2D, bolt: Bolt, { cell, ox, oy }: Board) {
    const fade = clamp01(bolt.life / bolt.max);
    if (bolt.beam) {
      const a = bolt.pts[0]!;
      const b = bolt.pts[bolt.pts.length - 1]!;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.strokeStyle = bolt.beam;
      ctx.globalAlpha = 0.35 * fade;
      ctx.lineWidth = cell * 0.22;
      ctx.beginPath();
      ctx.moveTo(ox + a.x * cell, oy + a.y * cell);
      ctx.lineTo(ox + b.x * cell, oy + b.y * cell);
      ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = "#fff6e0";
      ctx.lineWidth = Math.max(1.5, cell * 0.06);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const frame = Math.floor(bolt.life * 60);
    const path: Pt[] = [];
    for (let i = 0; i < bolt.pts.length - 1; i++) {
      const a = bolt.pts[i]!;
      const b = bolt.pts[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      const steps = Math.max(2, Math.round(len * 3));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const edge = k === 0 ? 0 : (hash(i * 11 + k, frame, 51) - 0.5) * 0.32;
        path.push({
          x: ox + (a.x + (b.x - a.x) * t + nx * edge) * cell,
          y: oy + (a.y + (b.y - a.y) * t + ny * edge) * cell,
        });
      }
    }
    const end = bolt.pts[bolt.pts.length - 1]!;
    path.push({ x: ox + end.x * cell, y: oy + end.y * cell });
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const layers: Array<[number, string, number]> = [
      [cell * 0.2, "rgb(70, 150, 255)", 0.3],
      [cell * 0.07, "rgb(190, 235, 255)", 0.9],
      [cell * 0.025, "rgb(255, 255, 255)", 1],
    ];
    for (const [width, color, alpha] of layers) {
      ctx.globalAlpha = alpha * fade;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, width);
      strokePath(ctx, path);
    }
    ctx.restore();
  }

  function drawShots(ctx: CanvasRenderingContext2D, world: World, board: Board) {
    const { cell, ox, oy } = board;
    for (const shot of world.shots) {
      if (!shot.alive) continue;
      const x = ox + shot.x * cell;
      const y = oy + shot.y * cell;
      let trail = trails.get(shot);
      if (!trail) {
        trail = [];
        trails.set(shot, trail);
      }
      const tail = trail[trail.length - 1];
      if (!tail || Math.hypot(tail.x - shot.x, tail.y - shot.y) > 0.02) {
        trail.push({ x: shot.x, y: shot.y });
        if (trail.length > (TRAIL_LEN[shot.kind] ?? 6)) trail.shift();
      }
      const ang = Math.atan2(shot.aimY - shot.y, shot.aimX - shot.x);

      // хвост
      ctx.lineCap = "round";
      const smoke = shot.kind === "ember";
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1]!;
        const b = trail[i]!;
        const t = i / trail.length;
        ctx.globalAlpha = t * (smoke ? 0.35 : 0.6);
        ctx.strokeStyle = smoke ? "#6b5a50" : shot.color;
        ctx.lineWidth = Math.max(1, cell * (smoke ? 0.14 : shot.kind === "ballista" ? 0.07 : 0.05) * t);
        ctx.beginPath();
        ctx.moveTo(ox + a.x * cell, oy + a.y * cell);
        ctx.lineTo(ox + b.x * cell, oy + b.y * cell);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      if (shot.kind === "archer") {
        const len = cell * 0.3;
        ctx.strokeStyle = "#e7efe6";
        ctx.lineWidth = Math.max(1.5, cell * 0.035);
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(len * 0.4, 0);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(len * 0.6, 0);
        ctx.lineTo(len * 0.25, -cell * 0.05);
        ctx.lineTo(len * 0.25, cell * 0.05);
        ctx.closePath();
        ctx.fill();
      } else if (shot.kind === "ember") {
        ctx.globalCompositeOperation = "lighter";
        blot(ctx, "rgba(226, 91, 58, 1)", 0, 0, cell * 0.34, 0.9);
        blot(ctx, "rgba(255, 210, 120, 1)", 0, 0, cell * 0.14, 1);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      } else if (shot.kind === "frost") {
        const r = cell * 0.1;
        ctx.fillStyle = "#cfe7f0";
        ctx.beginPath();
        ctx.moveTo(r * 1.8, 0);
        ctx.lineTo(0, -r * 0.7);
        ctx.lineTo(-r * 1.2, 0);
        ctx.lineTo(0, r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        blot(ctx, "rgba(158, 196, 212, 1)", 0, 0, cell * 0.22, 0.7);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      } else {
        const r = cell * 0.1;
        ctx.fillStyle = "#e2b15a";
        round(ctx, -r * 2.6, -r * 0.4, r * 5.2, r * 0.8, r * 0.4);
        ctx.fill();
        ctx.fillStyle = "#fff3d6";
        round(ctx, r * 0.6, -r * 0.25, r * 2, r * 0.5, r * 0.25);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Ночь: затемнение с «дырами» света, потом цветное свечение поверх. */
  function drawLighting(
    ctx: CanvasRenderingContext2D,
    world: World,
    board: Board,
    width: number,
    height: number,
    anim: number,
  ) {
    const { cell, ox, oy } = board;
    const lw = Math.max(1, Math.round(width * LIGHT_SCALE));
    const lh = Math.max(1, Math.round(height * LIGHT_SCALE));
    if (!light) light = makeCanvas(lw, lh);
    if (light.width !== lw || light.height !== lh) {
      light.width = lw;
      light.height = lh;
    }
    const l = light.getContext("2d")!;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = "source-over";
    l.globalAlpha = 1;
    l.clearRect(0, 0, lw, lh);
    l.fillStyle = `rgba(4, 7, 10, ${DARKNESS})`;
    l.fillRect(0, 0, lw, lh);
    l.setTransform(LIGHT_SCALE, 0, 0, LIGHT_SCALE, 0, 0);
    l.globalCompositeOperation = "destination-out";

    const lights: Array<[string, number, number, number, number]> = [];
    const gate = gateOf(world.map);
    for (const route of world.map.routes) {
      const first = route[0]!;
      lights.push(["rgba(226, 91, 58, 1)", ox + first.x * cell, oy + first.y * cell, cell * 2.2, 0.5 + Math.sin(anim * 3) * 0.08]);
    }
    lights.push(["rgba(226, 177, 90, 1)", ox + gate.x * cell, oy + gate.y * cell, cell * 2.6, 0.55 + Math.sin(anim * 2.2) * 0.06]);
    for (const tower of world.towers) {
      const { x, y } = towerCenter(tower, board);
      const def = TOWERS[tower.kind];
      const flicker = tower.kind === "ember" ? 0.08 * Math.sin(anim * 9 + tower.id) : 0;
      const reach = tower.kind === "ember" ? 2.1 : tower.kind === "frost" || tower.kind === "tesla" ? 1.8 : 1.4;
      lights.push([def.shot, x, y, cell * (reach + flicker + tower.recoil * 0.3), 0.32 + (tower.dmgRank + tower.rateRank) * 0.03]);
    }
    for (const enemy of world.enemies) {
      if (!enemy.alive) continue;
      const pos = enemyPos(enemy, board, anim);
      // твари всегда видны, но в полутьме
      lights.push(["rgba(255, 255, 255, 1)", pos.x, pos.y, cell * 0.8 * enemy.scale, 0]);
      if (enemy.kind === "wisp") lights.push([enemy.color, pos.x, pos.y, cell * 1.1, 0.35]);
    }
    for (const shot of world.shots) {
      if (!shot.alive) continue;
      lights.push([shot.color, ox + shot.x * cell, oy + shot.y * cell, cell * (shot.kind === "ember" ? 1.6 : 0.8), shot.kind === "ember" ? 0.5 : 0.25]);
    }
    for (const fire of world.fires) {
      lights.push(["rgba(255, 130, 50, 1)", ox + fire.x * cell, oy + fire.y * cell, cell * (fire.radius + 0.6), 0.45 * clamp01(fire.life / fire.max)]);
    }
    for (const flash of world.flashes) {
      const t = clamp01(flash.life / flash.max);
      lights.push([flash.color, ox + flash.x * cell, oy + flash.y * cell, cell * flash.radius * (0.6 + t * 0.4), t * 0.7]);
    }

    for (const [, x, y, r] of lights) blot(l, "rgba(255,255,255,1)", x, y, r, 0.95);
    l.globalAlpha = 1;
    l.globalCompositeOperation = "source-over";

    ctx.drawImage(light, 0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    for (const [color, x, y, r, a] of lights) blot(ctx, color, x, y, r * 0.8, a * 0.45);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  /** Подсказки игроку — рисуются поверх ночи, чтобы не тонули в темноте. */
  function drawOverlays(ctx: CanvasRenderingContext2D, world: World, board: Board) {
    const { cell, ox, oy } = board;
    const gap = Math.max(1, cell * 0.06);
    const radius = Math.max(2, cell * 0.14);
    const selected = world.towers.find((tower) => tower.id === world.selectedId);
    if (selected) {
      const def = TOWERS[selected.kind];
      rangeRing(ctx, board, selected.col, selected.row, selected.range, def.shot, true);
      const { x, y } = towerCenter(selected, board);
      ctx.strokeStyle = "#e2b15a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (world.build && world.hoverCol >= 0) {
      const open =
        !isRoad(world.map, world.hoverCol, world.hoverRow) &&
        !world.towers.some((t) => t.col === world.hoverCol && t.row === world.hoverRow);
      const def = TOWERS[world.build];
      rangeRing(ctx, board, world.hoverCol, world.hoverRow, def.range, open ? def.shot : "#e25b3a", open);
    }
    for (const strike of world.strikes) {
      const k = 1 - clamp01(strike.t / strike.max);
      const x = ox + strike.x * cell;
      const y = oy + strike.y * cell;
      const r = ABILITY_RADIUS * cell;
      ctx.fillStyle = `rgba(226, 91, 58, ${0.1 + 0.2 * k})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(226, 91, 58, 0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * (1 - 0.75 * k), 0, Math.PI * 2);
      ctx.stroke();
      // камень падает сверху и растёт
      const drop = (1 - k) * cell * 3.2;
      ctx.fillStyle = "#3a332c";
      ctx.strokeStyle = "#8a7a68";
      ctx.beginPath();
      ctx.arc(x, y - drop, cell * (0.28 + 0.18 * k), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (world.aiming && world.hoverFx >= 0) {
      const x = ox + world.hoverFx * cell;
      const y = oy + world.hoverFy * cell;
      const r = ABILITY_RADIUS * cell;
      ctx.fillStyle = "rgba(226, 91, 58, 0.1)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 150, 110, 0.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 7]);
      ctx.lineDashOffset = -world.anim * 18;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x - cell * 0.35, y);
      ctx.lineTo(x + cell * 0.35, y);
      ctx.moveTo(x, y - cell * 0.35);
      ctx.lineTo(x, y + cell * 0.35);
      ctx.stroke();
    }
    if (world.hoverCol >= 0 && world.hoverRow >= 0 && !world.aiming) {
      ctx.strokeStyle = "rgba(226, 177, 90, 0.9)";
      ctx.lineWidth = 1.5;
      round(ctx, ox + world.hoverCol * cell + gap, oy + world.hoverRow * cell + gap, cell - gap * 2, cell - gap * 2, radius);
      ctx.stroke();
    }
  }

  function rangeRing(
    ctx: CanvasRenderingContext2D,
    board: Board,
    col: number,
    row: number,
    range: number,
    color: string,
    ok: boolean,
  ) {
    const { cell, ox, oy } = board;
    const x = ox + (col + 0.5) * cell;
    const y = oy + (row + 0.5) * cell;
    ctx.beginPath();
    ctx.arc(x, y, range * cell, 0, Math.PI * 2);
    ctx.fillStyle = ok ? "rgba(226, 177, 90, 0.07)" : "rgba(226, 91, 58, 0.12)";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function drawBossBar(ctx: CanvasRenderingContext2D, world: World, width: number) {
    const boss = world.enemies.find((enemy) => enemy.alive && enemy.kind === "boss");
    if (!boss) return;
    const w = Math.min(360, width * 0.7);
    const h = 8;
    const x = (width - w) / 2;
    const y = 58;
    const pct = Math.max(0, boss.hp / boss.maxHp);
    ctx.font = "600 12px Manrope, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#e2b15a";
    ctx.fillText("ТАРАН", x, y - 6);
    ctx.textAlign = "right";
    ctx.fillStyle = "#e7efe6";
    ctx.fillText(`${Math.ceil(boss.hp)} / ${boss.maxHp}`, x + w, y - 6);
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    round(ctx, x - 2, y - 2, w + 4, h + 4, h);
    ctx.fill();
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, "#e25b3a");
    grad.addColorStop(1, "#e2b15a");
    ctx.fillStyle = grad;
    round(ctx, x, y, Math.max(h, w * pct), h, h);
    ctx.fill();
  }

  function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, anim: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "lighter";
    blot(ctx, "rgba(226, 91, 58, 1)", 0, 0, cell * 0.8, 0.45);
    ctx.globalAlpha = 1;
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = k === 1 ? "rgba(226, 177, 90, 0.75)" : "rgba(226, 91, 58, 0.85)";
      ctx.lineWidth = 2;
      const r = cell * (0.18 + k * 0.1);
      const a = anim * (k % 2 ? -1.6 : 1.2) + k;
      ctx.beginPath();
      ctx.arc(0, 0, r, a, a + Math.PI * 1.3);
      ctx.stroke();
    }
    // искры, которые затягивает в портал
    for (let k = 0; k < 6; k++) {
      const t = (anim * 0.5 + k / 6) % 1;
      const a = k * 1.7 + anim * 0.8;
      const r = cell * 0.55 * (1 - t);
      ctx.globalAlpha = t;
      ctx.fillStyle = "#ffb35a";
      ctx.fillRect(Math.cos(a) * r - 1, Math.sin(a) * r - 1, 2, 2);
    }
    ctx.restore();
  }

  function drawGate(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, anim: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "lighter";
    blot(ctx, "rgba(226, 177, 90, 1)", 0, 0, cell * 0.9, 0.3);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#2a241c";
    ctx.fillRect(-cell * 0.3, -cell * 0.44, cell * 0.13, cell * 0.88);
    ctx.fillRect(cell * 0.17, -cell * 0.44, cell * 0.13, cell * 0.88);
    ctx.strokeStyle = "#e2b15a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, cell * 0.02, cell * 0.3, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = `rgba(226, 91, 58, ${0.45 + Math.sin(anim * 3) * 0.15})`;
    ctx.fillRect(-cell * 0.08, -cell * 0.08, cell * 0.16, cell * 0.28);
    ctx.restore();
  }

  return { render };
}

function fallbackTower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = "#1a211c";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function fallbackCreep(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
