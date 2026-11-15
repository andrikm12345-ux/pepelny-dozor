import { AFFIXES, COLS, ENEMIES, HASTE_RADIUS, ROAR_AT, ROWS, SPEC_BY_ID, TOWERS, gateOf, isRoad, type GameMap, type Waypoint } from "./balance";
import type { Bolt, Corpse, Creep, Shot, Tower, World } from "./sim";

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
  /** Показанное здоровье твари: догоняет настоящее, чтобы был виден кусок урона. */
  const shownHp = new WeakMap<Creep, number>();
  let lastAnim = -1;
  let cracks: HTMLCanvasElement | null = null;
  let torches: Pt[] = [];

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

    // пепельный грунт: крупные пятна тёплого и холодного тона под плитами
    g.save();
    round(g, ox - cell * 0.12, oy - cell * 0.12, cell * COLS + cell * 0.24, cell * ROWS + cell * 0.24, cell * 0.3);
    g.clip();
    for (let i = 0; i < 46; i++) {
      const px = ox + hash(i, 1, 90) * cell * COLS;
      const py = oy + hash(i, 2, 91) * cell * ROWS;
      const pr = cell * (1.2 + hash(i, 3, 92) * 2.6);
      const warm = hash(i, 4, 93) > 0.55;
      const grad = g.createRadialGradient(px, py, 0, px, py, pr);
      grad.addColorStop(0, warm ? "rgba(92, 62, 40, 0.34)" : "rgba(46, 70, 62, 0.36)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      g.fillStyle = grad;
      g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    g.restore();

    const gap = Math.max(1, cell * 0.045);
    const radius = Math.max(2, cell * 0.16);
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (isRoad(map, col, row)) continue;
        const n = hash(col, row);
        const x = ox + col * cell + gap;
        const y = oy + row * cell + gap;
        const s = cell - gap * 2;
        // плита полупрозрачная: сквозь неё проступают пятна грунта, тон у каждой свой
        const shade = 0.5 + hash(col, row, 95) * 0.5;
        const tone = n > 0.66 ? [44, 52, 44] : n > 0.33 ? [36, 48, 42] : [48, 44, 38];
        const stone = g.createLinearGradient(x, y, x + s * 0.3, y + s);
        stone.addColorStop(0, `rgba(${tone[0] + 14}, ${tone[1] + 15}, ${tone[2] + 13}, ${0.62 + shade * 0.2})`);
        stone.addColorStop(1, `rgba(${tone[0] - 12}, ${tone[1] - 13}, ${tone[2] - 12}, ${0.72 + shade * 0.2})`);
        g.fillStyle = stone;
        round(g, x, y, s, s, radius);
        g.fill();
        // сколотый угол у части плит
        if (hash(col, row, 96) > 0.72) {
          const corner = Math.floor(hash(col, row, 97) * 4);
          const cx0 = x + (corner % 2 ? s : 0);
          const cy0 = y + (corner > 1 ? s : 0);
          g.fillStyle = "rgba(8, 11, 9, 0.85)";
          g.beginPath();
          g.moveTo(cx0, cy0);
          g.lineTo(cx0 + (corner % 2 ? -1 : 1) * s * (0.2 + hash(col, row, 98) * 0.14), cy0);
          g.lineTo(cx0, cy0 + (corner > 1 ? -1 : 1) * s * (0.2 + hash(col, row, 99) * 0.14));
          g.closePath();
          g.fill();
        }
        // камешки и кости
        const junk = hash(col, row, 100);
        if (junk > 0.8) {
          for (let k = 0; k < 3; k++) {
            g.fillStyle = k % 2 ? "rgba(140, 128, 110, 0.5)" : "rgba(20, 24, 21, 0.7)";
            g.beginPath();
            g.ellipse(x + s * (0.2 + hash(col, row, 101 + k) * 0.6), y + s * (0.25 + hash(col, row, 104 + k) * 0.55), s * 0.045, s * 0.032, hash(col, row, 107 + k) * 3, 0, Math.PI * 2);
            g.fill();
          }
        } else if (junk < 0.07) {
          const bx0 = x + s * 0.3;
          const by0 = y + s * 0.62;
          g.strokeStyle = "rgba(200, 192, 170, 0.5)";
          g.lineWidth = Math.max(1.2, cell * 0.035);
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(bx0, by0);
          g.lineTo(bx0 + s * 0.34, by0 - s * 0.12);
          g.stroke();
          g.fillStyle = "rgba(200, 192, 170, 0.5)";
          for (const [dx, dy] of [[0, 0], [0.34, -0.12]] as const) {
            g.beginPath();
            g.arc(bx0 + s * dx, by0 + s * dy, cell * 0.035, 0, Math.PI * 2);
            g.fill();
          }
        }
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
      ["rgba(0, 0, 0, 0.55)", 1.16],
      ["#0f0a07", 1.0],
      ["#2e2019", 0.86],
      ["#463226", 0.7],
      ["#5d4333", 0.46],
      ["#6b4e3b", 0.2],
      ["rgba(255, 220, 170, 0.06)", 0.08],
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
      // бордюрные камни по обеим кромкам
      const kerb = Math.floor(len / (cell * 0.34));
      for (let k = 0; k < kerb; k++) {
        for (const side of [-1, 1]) {
          if (hash(i, k, 44 + side) < 0.25) continue;
          const t = (k + 0.5) / kerb;
          const off = side * cell * (0.47 + hash(i, k, 46 + side) * 0.05);
          const px = a.x + (b.x - a.x) * t + nx * off;
          const py = a.y + (b.y - a.y) * t + ny * off;
          const r = cell * (0.055 + hash(i, k, 48 + side) * 0.04);
          g.fillStyle = "rgba(10, 8, 6, 0.6)";
          g.beginPath();
          g.ellipse(px + 1, py + 2, r * 1.2, r * 0.9, 0, 0, Math.PI * 2);
          g.fill();
          const lum = 62 + Math.floor(hash(i, k, 50 + side) * 34);
          g.fillStyle = `rgb(${lum + 10}, ${lum + 2}, ${lum - 8})`;
          g.beginPath();
          g.ellipse(px, py, r * 1.2, r * 0.9, hash(i, k, 52 + side) * Math.PI, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "rgba(255, 240, 215, 0.14)";
          g.beginPath();
          g.ellipse(px - r * 0.25, py - r * 0.3, r * 0.5, r * 0.3, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      // угли на тропе
      for (let k = 0; k < Math.floor(len / (cell * 1.1)); k++) {
        const t = hash(i, k, 55);
        const side = (hash(i, k, 56) - 0.5) * cell * 0.5;
        g.fillStyle = "rgba(226, 91, 58, 0.55)";
        g.fillRect(a.x + (b.x - a.x) * t + nx * side, a.y + (b.y - a.y) * t + ny * side, 1.6, 1.6);
      }
    }

    // факелы стоят на внешней стороне каждого поворота, у кромки тропы
    torches = [];
    for (const points of map.routes) {
      for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1]!;
        const cur = points[i]!;
        const next = points[i + 1]!;
        const ix = Math.sign(cur.x - prev.x) - Math.sign(next.x - cur.x);
        const iy = Math.sign(cur.y - prev.y) - Math.sign(next.y - cur.y);
        if (!ix && !iy) continue;
        torches.push({ x: ox + (cur.x + ix * 0.46) * cell, y: oy + (cur.y + iy * 0.46) * cell });
      }
    }

    // слой тлеющих трещин: рисуется один раз, в кадре только меняет яркость
    cracks = makeCanvas(width * dpr, height * dpr);
    const c = cracks.getContext("2d")!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.lineCap = "round";
    c.lineJoin = "round";
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (isRoad(map, col, row) || hash(col, row, 110) < 0.9) continue;
        const pts: Pt[] = [];
        let cx = ox + (col + 0.15 + hash(col, row, 111) * 0.3) * cell;
        let cy = oy + (row + 0.15 + hash(col, row, 112) * 0.2) * cell;
        pts.push({ x: cx, y: cy });
        for (let k = 0; k < 4; k++) {
          cx += (0.1 + hash(col + k, row, 113) * 0.16) * cell;
          cy += (hash(col, row + k, 114) - 0.25) * cell * 0.34;
          pts.push({ x: cx, y: cy });
        }
        for (const [color, w] of [["rgba(226, 70, 30, 0.5)", 0.11], ["rgba(255, 150, 60, 0.9)", 0.035]] as const) {
          c.strokeStyle = color;
          c.lineWidth = Math.max(1, cell * w);
          strokePath(c, pts);
        }
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

    // тлеющие трещины: готовый слой, который дышит
    if (cracks) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = reduceMotion ? 0.55 : 0.45 + Math.sin(world.anim * 1.3) * 0.2;
      ctx.drawImage(cracks, 0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    // завалы после Обвала: груда камней, которая оседает
    for (const pile of world.rubble) {
      const k = clamp01(pile.life / pile.max);
      const x = ox + pile.x * cell;
      const y = oy + pile.y * cell;
      ctx.globalAlpha = Math.min(1, k * 3) * 0.9;
      ctx.fillStyle = "rgba(20, 15, 11, 0.55)";
      ctx.beginPath();
      ctx.ellipse(x, y, pile.radius * cell, pile.radius * cell * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 16; i++) {
        const a = hash(i, pile.x * 9, 61) * Math.PI * 2;
        const d = Math.sqrt(hash(i, pile.y * 9, 62)) * pile.radius * cell * 0.85;
        const r = cell * (0.07 + hash(i, 3, 63) * 0.11);
        const px = x + Math.cos(a) * d;
        const py = y + Math.sin(a) * d * 0.8;
        ctx.fillStyle = i % 3 === 0 ? "#6f6253" : i % 3 === 1 ? "#4a4036" : "#8a7a68";
        ctx.beginPath();
        ctx.moveTo(px - r, py + r * 0.5);
        ctx.lineTo(px - r * 0.3, py - r);
        ctx.lineTo(px + r * 0.8, py - r * 0.5);
        ctx.lineTo(px + r, py + r * 0.6);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(226, 177, 90, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(x, y, pile.radius * cell * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
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
    drawGate(ctx, ox + gate.x * cell, oy + gate.y * cell, cell, anim, world.livesMax > 0 ? clamp01(world.lives / world.livesMax) : 1);

    // башни сверху вниз, чтобы нижние перекрывали верхние
    const towers = [...world.towers].sort((a, b) => a.row - b.row);
    for (const tower of towers) drawTower(ctx, tower, board, sprites, world, reduceMotion);

    drawTorches(ctx, cell, anim);
    for (const corpse of world.corpses) drawCorpse(ctx, corpse, board, sprites);
    const ordered = world.enemies.filter((enemy) => enemy.alive).sort((a, b) => a.y - b.y);
    for (const enemy of ordered) drawEnemy(ctx, enemy, board, sprites, anim);
    drawMeteors(ctx, world, board);

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

    // Гнев Димона: огненный отсвет по краям; Гроза: короткая белая вспышка
    if (world.wrathT > 0) {
      const k = Math.min(1, world.wrathT * 2) * (0.75 + Math.sin(world.anim * 9) * 0.1);
      const grad = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.75);
      grad.addColorStop(0, "rgba(255, 120, 50, 0)");
      grad.addColorStop(1, `rgba(255, 90, 30, ${0.4 * k})`);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
    }
    if (world.stormT > 0 && !reduceMotion) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(190, 225, 255, ${Math.min(0.28, world.stormT * 0.7)})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
    }
    if (world.rallyT > 0) {
      const k = Math.min(1, world.rallyT) * (0.6 + Math.sin(world.anim * 6) * 0.15);
      const grad = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.75);
      grad.addColorStop(0, "rgba(255, 216, 138, 0)");
      grad.addColorStop(1, `rgba(255, 200, 110, ${0.18 * k})`);
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

  /** Факелы на поворотах тропы: столбик, пламя из трёх языков, искры. */
  function drawTorches(ctx: CanvasRenderingContext2D, cell: number, anim: number) {
    for (let i = 0; i < torches.length; i++) {
      const { x, y } = torches[i]!;
      ctx.fillStyle = "#1b1410";
      ctx.fillRect(x - cell * 0.03, y - cell * 0.1, cell * 0.06, cell * 0.3);
      ctx.fillStyle = "#3a2c22";
      ctx.fillRect(x - cell * 0.06, y - cell * 0.14, cell * 0.12, cell * 0.06);
      const flick = Math.sin(anim * 11 + i * 2.3) * 0.5 + Math.sin(anim * 17 + i) * 0.5;
      ctx.globalCompositeOperation = "lighter";
      blot(ctx, "rgba(255, 120, 40, 1)", x, y - cell * 0.22, cell * (0.3 + flick * 0.03), 0.75);
      blot(ctx, "rgba(255, 215, 130, 1)", x + flick * cell * 0.015, y - cell * 0.24, cell * 0.13, 0.95);
      for (let k = 0; k < 2; k++) {
        const t = (anim * 0.9 + i * 0.37 + k * 0.5) % 1;
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.fillStyle = "#ffb35a";
        ctx.fillRect(x + Math.sin(t * 9 + i + k * 3) * cell * 0.08, y - cell * (0.3 + t * 0.55), 1.6, 1.6);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  }

  /** Останки: спрайт светлеет, оседает и рассыпается угольками. */
  function drawCorpse(ctx: CanvasRenderingContext2D, corpse: Corpse, board: Board, sprites: Record<string, HTMLImageElement>) {
    const { cell, ox, oy } = board;
    const t = 1 - clamp01(corpse.life / corpse.max);
    const x = ox + corpse.x * cell;
    const y = oy + corpse.y * cell - (corpse.flying ? cell * 0.1 : 0) + t * cell * 0.12;
    const size = cell * corpse.scale * 1.12 * (1 - t * 0.35);
    ctx.globalAlpha = (1 - t) * 0.85;
    drawSprite(ctx, sprites[corpse.kind], x, y, size, corpse.flip, 1 - t * 0.5, t * 0.5);
    ctx.globalCompositeOperation = "lighter";
    blot(ctx, "rgba(255, 150, 80, 1)", x, y, size * (0.4 + t * 0.4), (1 - t) * 0.6);
    for (let k = 0; k < 7; k++) {
      const a = hash(k, corpse.x * 13, 71) * Math.PI * 2;
      const d = t * cell * (0.25 + hash(k, corpse.y * 13, 72) * 0.5);
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.fillStyle = k % 2 ? "#ffb35a" : corpse.color;
      ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d - t * cell * 0.25, 2, 2);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  /** Метеоры Гнева: тень-прицел на земле и огненный шар с хвостом, падающий наискось. */
  function drawMeteors(ctx: CanvasRenderingContext2D, world: World, board: Board) {
    const { cell, ox, oy } = board;
    for (const meteor of world.meteors) {
      const k = 1 - clamp01(meteor.t / meteor.max);
      const x = ox + meteor.x * cell;
      const y = oy + meteor.y * cell;
      ctx.strokeStyle = `rgba(255, 120, 60, ${0.35 + 0.5 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, meteor.radius * cell * (1 - 0.5 * k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 90, 40, ${0.08 + 0.12 * k})`;
      ctx.beginPath();
      ctx.arc(x, y, meteor.radius * cell, 0, Math.PI * 2);
      ctx.fill();
      const drop = (1 - k) * cell * 5;
      const mx = x + drop * 0.45;
      const my = y - drop;
      ctx.globalCompositeOperation = "lighter";
      for (let i = 1; i <= 5; i++) {
        blot(ctx, "rgba(255, 110, 40, 1)", mx + i * cell * 0.11, my - i * cell * 0.24, cell * (0.34 - i * 0.045), 0.5 - i * 0.07);
      }
      blot(ctx, "rgba(255, 110, 40, 1)", mx, my, cell * 0.5, 0.95);
      blot(ctx, "rgba(255, 230, 160, 1)", mx, my, cell * 0.22, 1);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
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
    const breathe = reduceMotion ? 1 : 1 + Math.sin(world.anim * 1.7 + tower.id * 1.3) * 0.012;
    const grow = (reduceMotion ? 1 : easeOutBack(clamp01((world.anim - tower.born) / 0.4))) * breathe;
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

    if (world.rallyT > 0 && def.aura <= 0) {
      ctx.globalCompositeOperation = "lighter";
      blot(ctx, "rgba(255, 216, 138, 1)", x, y, cell * (0.75 + Math.sin(world.anim * 8 + tower.id) * 0.06), 0.4);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    const sway = tower.kind === "banner" && !reduceMotion ? Math.sin(world.anim * 2.4 + tower.id) * 0.05 : 0;
    const silenced = tower.silenceT > 0;
    if (silenced) ctx.globalAlpha = 0.55;
    if (!drawSprite(ctx, sprites[tower.kind], bx, by, size, false, 1, sway)) {
      fallbackTower(ctx, bx, by, cell * 0.42 * grow, def.shot);
    }
    ctx.globalAlpha = 1;
    if (!reduceMotion && !silenced) towerLife(ctx, tower, bx, by, cell, world.anim);
    // вспышка у дула в момент выстрела
    if (tower.recoil > 0.55 && def.damage > 0 && tower.kind !== "tesla") {
      const fx = bx + Math.cos(tower.angle) * cell * 0.5;
      const fy = by + Math.sin(tower.angle) * cell * 0.5;
      ctx.globalCompositeOperation = "lighter";
      blot(ctx, def.shot, fx, fy, cell * 0.42 * tower.recoil, 0.9);
      blot(ctx, "rgba(255,255,255,1)", fx, fy, cell * 0.16 * tower.recoil, 1);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    if (silenced) {
      // цепь глушения: два звена крест-накрест и лиловая дымка
      ctx.globalCompositeOperation = "lighter";
      blot(ctx, "rgba(196, 107, 255, 1)", x, y, cell * 0.7, 0.35 + Math.sin(world.anim * 10) * 0.08);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#d9a8ff";
      ctx.lineWidth = Math.max(2, cell * 0.06);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - cell * 0.32, y - cell * 0.3);
      ctx.lineTo(x + cell * 0.32, y + cell * 0.3);
      ctx.moveTo(x + cell * 0.32, y - cell * 0.3);
      ctx.lineTo(x - cell * 0.32, y + cell * 0.3);
      ctx.stroke();
      ctx.fillStyle = "#1a0f24";
      ctx.strokeStyle = "#d9a8ff";
      ctx.lineWidth = Math.max(1.5, cell * 0.04);
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // ствол смотрит на цель
    if (def.damage > 0 && tower.kind !== "tesla" && !silenced) {
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

  /** Жизнь башни в покое: пламя Костра, блики Фонаря, разряды Молнии. */
  function towerLife(ctx: CanvasRenderingContext2D, tower: Tower, x: number, y: number, cell: number, anim: number) {
    ctx.globalCompositeOperation = "lighter";
    if (tower.kind === "ember") {
      const flick = Math.sin(anim * 13 + tower.id) * 0.5 + Math.sin(anim * 7.3 + tower.id * 2) * 0.5;
      blot(ctx, "rgba(255, 110, 40, 1)", x, y - cell * 0.3, cell * (0.3 + flick * 0.04), 0.7);
      blot(ctx, "rgba(255, 220, 140, 1)", x + flick * cell * 0.02, y - cell * 0.34, cell * 0.13, 0.9);
      for (let k = 0; k < 3; k++) {
        const t = (anim * 0.8 + tower.id * 0.31 + k / 3) % 1;
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.fillStyle = "#ffb35a";
        ctx.fillRect(x + Math.sin(t * 8 + k * 2 + tower.id) * cell * 0.12, y - cell * (0.36 + t * 0.6), 1.8, 1.8);
      }
    } else if (tower.kind === "frost") {
      blot(ctx, "rgba(158, 196, 212, 1)", x, y - cell * 0.12, cell * (0.34 + Math.sin(anim * 2.2 + tower.id) * 0.04), 0.45);
      ctx.strokeStyle = "#e8f8ff";
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) {
        const t = (anim * 0.5 + k / 3 + tower.id * 0.17) % 1;
        const a = k * 2.1 + tower.id;
        const sx = x + Math.cos(a) * cell * 0.34;
        const sy = y - cell * 0.1 + Math.sin(a) * cell * 0.26 - t * cell * 0.15;
        const r = cell * 0.045 * Math.sin(t * Math.PI);
        ctx.globalAlpha = Math.sin(t * Math.PI);
        ctx.beginPath();
        ctx.moveTo(sx - r, sy);
        ctx.lineTo(sx + r, sy);
        ctx.moveTo(sx, sy - r);
        ctx.lineTo(sx, sy + r);
        ctx.stroke();
      }
    } else if (tower.kind === "tesla") {
      blot(ctx, "rgba(143, 214, 255, 1)", x, y - cell * 0.3, cell * (0.22 + Math.sin(anim * 9 + tower.id) * 0.03), 0.6);
      const frame = Math.floor(anim * 14) + tower.id;
      if (frame % 3 === 0) {
        ctx.strokeStyle = "#dff4ff";
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.9;
        const a = hash(frame, 1, 81) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x, y - cell * 0.3);
        ctx.lineTo(x + Math.cos(a) * cell * 0.14 + (hash(frame, 2, 82) - 0.5) * cell * 0.1, y - cell * 0.3 + Math.sin(a) * cell * 0.14);
        ctx.lineTo(x + Math.cos(a) * cell * 0.3, y - cell * 0.3 + Math.sin(a) * cell * 0.3);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
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
    // выход из портала: тварь вырастает на первых шагах
    const emerge = enemy.ownerId ? 1 : Math.min(1, 0.45 + enemy.travel * 1.4);
    const size = cell * enemy.scale * 1.12 * emerge;
    const groundY = board.oy + enemy.y * cell;
    if (emerge < 1) {
      ctx.globalCompositeOperation = "lighter";
      blot(ctx, "rgba(226, 91, 58, 1)", x, y, size * 0.9, (1 - emerge) * 1.2);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    if (enemy.elite) {
      // элитная: вращающийся пунктирный ореол цвета свойства
      const color = AFFIXES[enemy.elite].color;
      ctx.globalCompositeOperation = "lighter";
      blot(ctx, color, x, y, size * 0.85, 0.3 + Math.sin(anim * 5 + enemy.id) * 0.08);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, cell * 0.045);
      ctx.setLineDash([cell * 0.14, cell * 0.1]);
      ctx.lineDashOffset = -anim * cell * 0.5;
      ctx.beginPath();
      ctx.ellipse(x, groundY + size * 0.3, size * 0.42, size * 0.17, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (enemy.kind === "drummer") {
      // круги горна расходятся до края ауры
      ctx.strokeStyle = "rgba(255, 176, 74, 0.5)";
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 2; k++) {
        const t = (anim * 0.8 + k * 0.5) % 1;
        ctx.globalAlpha = (1 - t) * 0.6;
        ctx.beginPath();
        ctx.arc(x, groundY, HASTE_RADIUS * cell * t, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (enemy.kind === "silencer") {
      ctx.globalCompositeOperation = "lighter";
      blot(ctx, "rgba(196, 107, 255, 1)", x, y, size * 0.8, 0.3 + Math.sin(anim * 4 + enemy.id) * 0.1);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    if (enemy.dashT > 0 || enemy.haste) {
      // полосы скорости позади
      ctx.strokeStyle = enemy.dashT > 0 ? "rgba(255, 243, 214, 0.8)" : "rgba(255, 176, 74, 0.55)";
      ctx.lineWidth = Math.max(1, cell * 0.03);
      ctx.lineCap = "round";
      for (let k = -1; k <= 1; k++) {
        const px = -enemy.vy * k * size * 0.2;
        const py = enemy.vx * k * size * 0.2;
        const len = size * (enemy.dashT > 0 ? 0.6 : 0.35) * (1 - Math.abs(k) * 0.3);
        ctx.beginPath();
        ctx.moveTo(x + px - enemy.vx * size * 0.3, y + py - enemy.vy * size * 0.3);
        ctx.lineTo(x + px - enemy.vx * (size * 0.3 + len), y + py - enemy.vy * (size * 0.3 + len));
        ctx.stroke();
      }
    }
    // скрытая Тень игроку видна, но призраком
    const ghost = enemy.kind === "shade" && enemy.hidden;

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
    if (ghost) ctx.globalAlpha = 0.32 + Math.sin(anim * 3 + enemy.id) * 0.08;
    if (!drawSprite(ctx, sprites[enemy.kind], x, y, size, flip, squash, tilt)) {
      fallbackCreep(ctx, x, y, size * 0.32, enemy.color);
    }
    ctx.globalAlpha = 1;
    if (enemy.kind === "shade" && !ghost) {
      // раскрытая Тень: метка-глаз над ней
      ctx.strokeStyle = "#cfd6ff";
      ctx.lineWidth = Math.max(1.2, cell * 0.03);
      ctx.beginPath();
      ctx.ellipse(x, y - size * 0.62, size * 0.16, size * 0.08, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#cfd6ff";
      ctx.beginPath();
      ctx.arc(x, y - size * 0.62, size * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
    if (enemy.shellT > 0) {
      // панцирь: стальной купол с бликом
      const grad = ctx.createRadialGradient(x - size * 0.15, y - size * 0.2, size * 0.05, x, y, size * 0.55);
      grad.addColorStop(0, "rgba(240, 246, 250, 0.75)");
      grad.addColorStop(0.5, "rgba(150, 165, 175, 0.5)");
      grad.addColorStop(1, "rgba(70, 82, 92, 0.6)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(225, 235, 240, 0.9)";
      ctx.lineWidth = Math.max(1.5, cell * 0.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - size * 0.5, y);
      ctx.lineTo(x + size * 0.5, y);
      ctx.moveTo(x, y - size * 0.5);
      ctx.lineTo(x, y + size * 0.5);
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
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
    const was = shownHp.get(enemy) ?? 1;
    const lag = pct > was ? pct : Math.max(pct, was - 0.012);
    shownHp.set(enemy, lag);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    round(ctx, bx - 1, by - 1, w + 2, h + 2, h);
    ctx.fill();
    if (lag > pct + 0.01) {
      ctx.fillStyle = "rgba(255, 246, 234, 0.85)";
      round(ctx, bx, by, Math.max(h, w * lag), h, h);
      ctx.fill();
    }
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
        // стрела: древко, оперение, наконечник с бликом
        const len = cell * 0.34;
        ctx.strokeStyle = "#cdb898";
        ctx.lineWidth = Math.max(1.5, cell * 0.035);
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(len * 0.4, 0);
        ctx.stroke();
        ctx.strokeStyle = "#e7efe6";
        ctx.lineWidth = Math.max(1, cell * 0.025);
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(-len * 1.25, -cell * 0.06);
        ctx.moveTo(-len, 0);
        ctx.lineTo(-len * 1.25, cell * 0.06);
        ctx.moveTo(-len * 0.8, 0);
        ctx.lineTo(-len * 1.05, -cell * 0.06);
        ctx.moveTo(-len * 0.8, 0);
        ctx.lineTo(-len * 1.05, cell * 0.06);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(len * 0.7, 0);
        ctx.lineTo(len * 0.25, -cell * 0.06);
        ctx.lineTo(len * 0.25, cell * 0.06);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        blot(ctx, "rgba(231, 239, 230, 1)", len * 0.5, 0, cell * 0.14, 0.6);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      } else if (shot.kind === "ember") {
        // огненный шар: ядро, корона и языки пламени назад
        ctx.globalCompositeOperation = "lighter";
        for (let k = 1; k <= 4; k++) {
          const wob = Math.sin(world.anim * 30 + k * 1.7) * cell * 0.04;
          blot(ctx, "rgba(255, 100, 30, 1)", -k * cell * 0.13, wob, cell * (0.3 - k * 0.045), 0.7 - k * 0.12);
        }
        blot(ctx, "rgba(226, 91, 58, 1)", 0, 0, cell * 0.4, 0.95);
        blot(ctx, "rgba(255, 190, 90, 1)", 0, 0, cell * 0.22, 1);
        blot(ctx, "rgba(255, 250, 220, 1)", 0, 0, cell * 0.1, 1);
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
    for (let i = 0; i < torches.length; i++) {
      const torch = torches[i]!;
      lights.push(["rgba(255, 150, 70, 1)", torch.x, torch.y - cell * 0.2, cell * (1.55 + Math.sin(anim * 10 + i * 2.1) * 0.07), 0.42]);
    }
    for (const meteor of world.meteors) {
      lights.push(["rgba(255, 130, 60, 1)", ox + meteor.x * cell, oy + meteor.y * cell, cell * 2.2, 0.5]);
    }
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
      const r = strike.radius * cell;
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
      const r = world.aimRadius * cell;
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
    // метки рёва: на этих долях здоровья Таран глушит башни
    ctx.fillStyle = "#0c100e";
    for (let i = boss.roars; i < ROAR_AT.length; i++) ctx.fillRect(x + w * ROAR_AT[i]! - 1, y - 2, 2, h + 4);
  }

  function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, anim: number) {
    ctx.save();
    ctx.translate(x, y);
    // тёмная воронка, вокруг — закрученные рукава и искры, которые в неё затягивает
    ctx.fillStyle = "rgba(6, 3, 3, 0.9)";
    ctx.beginPath();
    ctx.ellipse(0, 0, cell * 0.42, cell * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    blot(ctx, "rgba(226, 91, 58, 1)", 0, 0, cell * (1.0 + Math.sin(anim * 2.4) * 0.06), 0.55);
    blot(ctx, "rgba(150, 60, 200, 1)", 0, 0, cell * 0.6, 0.35);
    ctx.lineCap = "round";
    for (let k = 0; k < 5; k++) {
      const r = cell * (0.12 + k * 0.075);
      const a = anim * (k % 2 ? -1.9 : 1.4) + k * 1.3;
      ctx.globalAlpha = 0.9 - k * 0.12;
      ctx.strokeStyle = k % 3 === 0 ? "#ffd27a" : k % 3 === 1 ? "#e25b3a" : "#c46bff";
      ctx.lineWidth = Math.max(1.5, cell * (0.05 - k * 0.006));
      ctx.beginPath();
      ctx.arc(0, 0, r, a, a + Math.PI * (1.1 - k * 0.1));
      ctx.stroke();
    }
    for (let k = 0; k < 10; k++) {
      const t = (anim * 0.45 + k / 10) % 1;
      const a = k * 1.7 + anim * 1.1 + t * 3;
      const r = cell * 0.75 * (1 - t);
      ctx.globalAlpha = t;
      ctx.fillStyle = k % 2 ? "#ffb35a" : "#ff7a4a";
      ctx.fillRect(Math.cos(a) * r - 1, Math.sin(a) * r - 1, 2, 2);
    }
    ctx.restore();
  }

  function drawGate(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, anim: number, health = 1) {
    ctx.save();
    ctx.translate(x, y);
    // чем меньше жизней, тем слабее и тревожнее свет врат
    const warm = 0.35 + health * 0.65;
    const alarm = health < 0.35 ? 0.5 + Math.sin(anim * 9) * 0.5 : 0;
    ctx.globalCompositeOperation = "lighter";
    blot(ctx, "rgba(226, 177, 90, 1)", 0, 0, cell * 1.15, 0.38 * warm);
    if (alarm > 0) blot(ctx, "rgba(226, 60, 40, 1)", 0, 0, cell * 1.3, 0.4 * alarm);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    // каменная арка
    const stone = ctx.createLinearGradient(0, -cell * 0.5, 0, cell * 0.45);
    stone.addColorStop(0, "#5b5146");
    stone.addColorStop(1, "#2a241c");
    ctx.fillStyle = stone;
    ctx.strokeStyle = "#14100c";
    ctx.lineWidth = Math.max(1, cell * 0.03);
    ctx.beginPath();
    ctx.moveTo(-cell * 0.42, cell * 0.45);
    ctx.lineTo(-cell * 0.42, -cell * 0.08);
    ctx.arc(0, -cell * 0.08, cell * 0.42, Math.PI, 0);
    ctx.lineTo(cell * 0.42, cell * 0.45);
    ctx.lineTo(cell * 0.25, cell * 0.45);
    ctx.lineTo(cell * 0.25, -cell * 0.08);
    ctx.arc(0, -cell * 0.08, cell * 0.25, 0, Math.PI, true);
    ctx.lineTo(-cell * 0.25, cell * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // створ: решётка и свет изнутри
    ctx.fillStyle = `rgba(226, ${Math.round(120 + 60 * health)}, 70, ${0.35 + 0.3 * warm + Math.sin(anim * 3) * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(-cell * 0.25, cell * 0.45);
    ctx.lineTo(-cell * 0.25, -cell * 0.08);
    ctx.arc(0, -cell * 0.08, cell * 0.25, Math.PI, 0);
    ctx.lineTo(cell * 0.25, cell * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(20, 14, 9, 0.85)";
    ctx.lineWidth = Math.max(1, cell * 0.035);
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(k * cell * 0.12, -cell * 0.3);
      ctx.lineTo(k * cell * 0.12, cell * 0.45);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-cell * 0.25, cell * 0.08);
    ctx.lineTo(cell * 0.25, cell * 0.08);
    ctx.stroke();
    // золотой замковый камень и жаровни по бокам
    ctx.fillStyle = "#e2b15a";
    ctx.beginPath();
    ctx.moveTo(0, -cell * 0.56);
    ctx.lineTo(cell * 0.07, -cell * 0.46);
    ctx.lineTo(0, -cell * 0.36);
    ctx.lineTo(-cell * 0.07, -cell * 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    for (const side of [-1, 1]) {
      const bx = side * cell * 0.56;
      const flick = Math.sin(anim * 12 + side * 2) * 0.5 + Math.sin(anim * 7 + side) * 0.5;
      blot(ctx, "rgba(255, 120, 40, 1)", bx, cell * 0.1, cell * (0.26 + flick * 0.03) * warm, 0.8 * warm);
      blot(ctx, "rgba(255, 220, 140, 1)", bx, cell * 0.08, cell * 0.1 * warm, 0.95);
    }
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
