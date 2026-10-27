import { COLS, ROWS, TOWERS, WAYPOINTS, isRoad } from "./balance";
import type { World } from "./sim";

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

function shade(col: number, row: number): number {
  const n = Math.abs(Math.sin(col * 12.9898 + row * 78.233) * 43758.5453);
  return n - Math.floor(n);
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  x: number,
  y: number,
  size: number,
  flip: boolean,
) {
  if (!img || !img.complete || img.naturalWidth === 0) return false;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
  return true;
}

function strokePath(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.stroke();
}

export function render(
  ctx: CanvasRenderingContext2D,
  world: World,
  sprites: Record<string, HTMLImageElement>,
  width: number,
  height: number,
  reduceMotion: boolean,
) {
  const { cell, ox, oy } = boardLayout(width, height);
  const anim = reduceMotion ? 0 : world.anim;
  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#141c18");
  sky.addColorStop(1, "#0a0e0c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  if (!reduceMotion && world.shake > 0.02) {
    const mag = world.shake * cell * 0.22;
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }

  const gap = Math.max(1, cell * 0.07);
  const radius = Math.max(2, cell * 0.16);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (isRoad(col, row)) continue;
      const n = shade(col, row);
      const x = ox + col * cell + gap;
      const y = oy + row * cell + gap;
      const s = cell - gap * 2;
      ctx.fillStyle = n > 0.5 ? "#1a2420" : "#202b26";
      round(ctx, x, y, s, s, radius);
      ctx.fill();
      ctx.strokeStyle = "rgba(226, 177, 90, 0.05)";
      ctx.lineWidth = 1;
      ctx.stroke();
      if (n > 0.93) {
        ctx.fillStyle = "rgba(126, 174, 138, 0.28)";
        ctx.beginPath();
        ctx.ellipse(x + s * 0.32, y + s * 0.7, s * 0.12, s * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const pts = WAYPOINTS.map((point) => ({
    x: ox + point.x * cell,
    y: oy + point.y * cell,
  }));
  const first = pts[0]!;
  const second = pts[1] ?? first;
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2] ?? last;
  const enter = Math.hypot(second.x - first.x, second.y - first.y) || 1;
  const exit = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
  const ribbon = [
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

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#241812";
  ctx.lineWidth = cell * 0.96;
  strokePath(ctx, ribbon);
  ctx.strokeStyle = "#4e382c";
  ctx.lineWidth = cell * 0.7;
  strokePath(ctx, ribbon);
  ctx.strokeStyle = "rgba(226, 177, 90, 0.35)";
  ctx.lineWidth = Math.max(1, cell * 0.06);
  ctx.setLineDash([cell * 0.28, cell * 0.48]);
  ctx.lineDashOffset = -anim * cell * 0.55;
  strokePath(ctx, ribbon);
  ctx.setLineDash([]);

  drawPortal(ctx, first.x, first.y, cell, anim);
  drawGate(ctx, last.x, last.y, cell, anim);

  const selected = world.towers.find((tower) => tower.id === world.selectedId);
  if (selected) ring(ctx, ox, oy, cell, selected.col, selected.row, TOWERS[selected.kind].range, TOWERS[selected.kind].shot, true);
  if (world.build && world.hoverCol >= 0) {
    const open = !isRoad(world.hoverCol, world.hoverRow) && !world.towers.some((t) => t.col === world.hoverCol && t.row === world.hoverRow);
    ring(ctx, ox, oy, cell, world.hoverCol, world.hoverRow, TOWERS[world.build].range, open ? TOWERS[world.build].shot : "#e25b3a", open);
  }

  if (world.hoverCol >= 0 && world.hoverRow >= 0) {
    const hx = ox + world.hoverCol * cell + gap;
    const hy = oy + world.hoverRow * cell + gap;
    ctx.strokeStyle = "rgba(226, 177, 90, 0.85)";
    ctx.lineWidth = 1.5;
    round(ctx, hx, hy, cell - gap * 2, cell - gap * 2, radius);
    ctx.stroke();
  }

  for (const tower of world.towers) {
    const def = TOWERS[tower.kind];
    const x = ox + (tower.col + 0.5) * cell;
    const y = oy + (tower.row + 0.5) * cell;
    const size = cell * (1.22 + tower.recoil * 0.05);
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y + size * 0.28, size * 0.28, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    const drawn = drawSprite(ctx, sprites[tower.kind], x, y, size, false);
    if (!drawn) fallbackTower(ctx, x, y, cell * 0.42, def.shot);
    const ax = x + Math.cos(tower.angle) * cell * 0.46;
    const ay = y + Math.sin(tower.angle) * cell * 0.46;
    ctx.strokeStyle = def.shot;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(tower.angle) * cell * 0.18, y + Math.sin(tower.angle) * cell * 0.18);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (tower.id === world.selectedId) {
      ctx.strokeStyle = "#e2b15a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.48, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (world.build && world.hoverCol >= 0 && !isRoad(world.hoverCol, world.hoverRow)) {
    const occupied = world.towers.some((t) => t.col === world.hoverCol && t.row === world.hoverRow);
    if (!occupied) {
      const x = ox + (world.hoverCol + 0.5) * cell;
      const y = oy + (world.hoverRow + 0.5) * cell;
      ctx.globalAlpha = 0.55;
      if (!drawSprite(ctx, sprites[world.build], x, y, cell * 1.22, false)) {
        fallbackTower(ctx, x, y, cell * 0.42, TOWERS[world.build].shot);
      }
      ctx.globalAlpha = 1;
    }
  }

  const ordered = [...world.enemies].filter((enemy) => enemy.alive).sort((a, b) => a.y - b.y);
  for (const enemy of ordered) {
    const x = ox + enemy.x * cell;
    const y = oy + enemy.y * cell + (enemy.flying ? Math.sin(anim * 4 + enemy.id) * cell * 0.08 : Math.sin(anim * 3 + enemy.id) * cell * 0.03);
    const size = cell * enemy.scale * 1.12;
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.beginPath();
    ctx.ellipse(x, y + size * 0.32, size * 0.26, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    if (enemy.flying) {
      ctx.strokeStyle = "rgba(226, 177, 90, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
    const flip = enemy.vx < -0.2;
    const drawn = drawSprite(ctx, sprites[enemy.kind], x, y, size, flip);
    if (!drawn) fallbackCreep(ctx, x, y, size * 0.32, enemy.color);
    if (enemy.flash > 0) {
      ctx.globalAlpha = Math.min(0.7, enemy.flash * 4);
      ctx.fillStyle = "#fff6ea";
      ctx.beginPath();
      ctx.arc(x, y, size * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (enemy.hp < enemy.maxHp || enemy.kind === "boss") {
      const w = Math.max(cell * 0.55, size * 0.62);
      const pct = Math.max(0, enemy.hp / enemy.maxHp);
      const bx = x - w / 2;
      const by = y - size * 0.52;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      round(ctx, bx, by, w, Math.max(3, cell * 0.08), 2);
      ctx.fill();
      ctx.fillStyle = pct > 0.45 ? "#7eae8a" : "#e25b3a";
      round(ctx, bx, by, w * pct, Math.max(3, cell * 0.08), 2);
      ctx.fill();
    }
    if (enemy.slowT > 0) {
      ctx.strokeStyle = "rgba(158, 196, 212, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  for (const shot of world.shots) {
    if (!shot.alive) continue;
    const x = ox + shot.x * cell;
    const y = oy + shot.y * cell;
    const r = shot.kind === "ember" ? cell * 0.16 : shot.kind === "ballista" ? cell * 0.1 : cell * 0.08;
    ctx.fillStyle = shot.color;
    ctx.beginPath();
    if (shot.kind === "ballista") {
      const ang = Math.atan2(shot.aimY - shot.y, shot.aimX - shot.x);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      round(ctx, -r * 2.2, -r * 0.45, r * 4.4, r * 0.9, r);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (const particle of world.particles) {
    const alpha = Math.max(0, particle.life / particle.max);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(ox + particle.x * cell, oy + particle.y * cell, particle.size * cell, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.font = `600 ${Math.max(12, cell * 0.32)}px Manrope, sans-serif`;
  ctx.textAlign = "center";
  for (const floater of world.floaters) {
    ctx.globalAlpha = Math.max(0, floater.life / floater.max);
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, ox + floater.x * cell, oy + floater.y * cell);
  }
  ctx.globalAlpha = 1;

  if (world.hurt > 0.02) {
    ctx.fillStyle = `rgba(226, 91, 58, ${world.hurt * 0.28})`;
    ctx.fillRect(-20, -20, width + 40, height + 40);
  }

  ctx.restore();
}

function ring(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  cell: number,
  col: number,
  row: number,
  range: number,
  color: string,
  ok: boolean,
) {
  const x = ox + (col + 0.5) * cell;
  const y = oy + (row + 0.5) * cell;
  ctx.beginPath();
  ctx.arc(x, y, range * cell, 0, Math.PI * 2);
  ctx.fillStyle = ok ? "rgba(226, 177, 90, 0.08)" : "rgba(226, 91, 58, 0.12)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, anim: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(226, 91, 58, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, cell * 0.34, anim, anim + Math.PI * 1.4);
  ctx.stroke();
  ctx.strokeStyle = "rgba(226, 177, 90, 0.7)";
  ctx.beginPath();
  ctx.arc(0, 0, cell * 0.22, -anim * 1.4, -anim * 1.4 + Math.PI);
  ctx.stroke();
  ctx.fillStyle = "rgba(226, 91, 58, 0.35)";
  ctx.beginPath();
  ctx.arc(0, 0, cell * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGate(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, anim: number) {
  ctx.save();
  ctx.translate(x, y);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, cell * 0.7);
  glow.addColorStop(0, "rgba(226, 177, 90, 0.28)");
  glow.addColorStop(1, "rgba(226, 177, 90, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, cell * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a241c";
  ctx.fillRect(-cell * 0.28, -cell * 0.42, cell * 0.12, cell * 0.84);
  ctx.fillRect(cell * 0.16, -cell * 0.42, cell * 0.12, cell * 0.84);
  ctx.strokeStyle = "#e2b15a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, cell * 0.02, cell * 0.28, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = `rgba(226, 91, 58, ${0.35 + Math.sin(anim * 3) * 0.15})`;
  ctx.fillRect(-cell * 0.08, -cell * 0.08, cell * 0.16, cell * 0.28);
  ctx.restore();
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
