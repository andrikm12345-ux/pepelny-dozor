import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  Coins,
  Crosshair,
  Flag,
  Flame,
  Heart,
  Infinity as InfinityIcon,
  Mountain,
  Pause,
  Play,
  RotateCcw,
  Snowflake,
  Target,
  Volume2,
  VolumeX,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  MAP_ORDER,
  MAPS,
  MAX_RANK,
  PREP_SECONDS,
  TARGETS,
  TOWER_ORDER,
  TOWERS,
  towerTraits,
  type Difficulty,
  type MapId,
  type TowerDef,
  type TowerKind,
} from "@/game/balance";
import { boardLayout, createRenderer } from "@/game/draw";
import { dimonNote, dimonShout } from "@/game/dimon";
import { createSim, type Hud, type Sim } from "@/game/sim";

const ICONS: Record<TowerKind, LucideIcon> = {
  archer: Target,
  ember: Flame,
  frost: Snowflake,
  ballista: Crosshair,
  tesla: Zap,
  banner: Flag,
};

const TUTORIAL_KEY = "pepelny-dozor-tutor";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function GameApp() {
  const [sim] = useState(createSim);
  const hud = useSyncExternalStore(sim.subscribe, sim.getSnapshot, sim.getSnapshot);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    sim.loadProgress();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sprites: Record<string, HTMLImageElement> = {};
    for (const kind of [
      "archer",
      "ember",
      "frost",
      "ballista",
      "tesla",
      "banner",
      "mite",
      "runner",
      "husk",
      "wisp",
      "healer",
      "shield",
      "summoner",
      "boss",
    ]) {
      const img = new Image();
      img.decoding = "async";
      img.src = `/sprites/${kind}.png`;
      sprites[kind] = img;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = createRenderer();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let last = performance.now();

    const paint = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim.frame(dt);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const bw = Math.max(1, Math.round(w * dpr));
      const bh = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderer.render(ctx, sim.world, sprites, w, h, reduce);
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);

    const onVis = () => {
      if (document.visibilityState === "visible") sim.unlock();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.code === "Space") {
        event.preventDefault();
        sim.callWave();
      } else if (event.code === "KeyP") sim.togglePause();
      else if (event.code === "Escape") sim.dismiss();
      else if (event.code === "Digit1") sim.selectBuild("archer");
      else if (event.code === "Digit2") sim.selectBuild("ember");
      else if (event.code === "Digit3") sim.selectBuild("frost");
      else if (event.code === "Digit4") sim.selectBuild("ballista");
      else if (event.code === "Digit5") sim.selectBuild("tesla");
      else if (event.code === "Digit6") sim.selectBuild("banner");
      else if (event.code === "KeyQ") sim.toggleAim();
      else if (event.code === "KeyZ" || event.code === "KeyX") {
        const pick = sim.getSnapshot().selection?.specs[event.code === "KeyZ" ? 0 : 1];
        if (pick) sim.specialize(pick.id);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey);
    };
  }, [sim]);

  const cellFromEvent = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const layout = boardLayout(rect.width, rect.height);
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const fx = (x - layout.ox) / layout.cell;
    const fy = (y - layout.oy) / layout.cell;
    return { col: Math.floor(fx), row: Math.floor(fy), fx, fy };
  };

  const intro = useWaveIntro(hud.phase, hud.wave);
  useFirstWaveDone(hud.phase);
  const gold = useTweened(hud.gold);

  const ended = hud.phase === "menu" || hud.phase === "victory" || hud.phase === "defeat";
  const progress =
    hud.combatTotal > 0 ? Math.max(0, Math.min(1, 1 - hud.combatLeft / hud.combatTotal)) : 0;

  return (
    <div className="flex h-dvh select-none flex-col overflow-hidden bg-bg text-fg">
      <header className="flex shrink-0 items-center border-b border-line">
        <div className="shrink-0 px-3 py-2 sm:px-4">
          <p className="text-xs tracking-[0.18em] text-muted uppercase">Застава Димона</p>
          <h1 className="font-display text-xl leading-none text-gold sm:text-2xl">Дозор Димона</h1>
        </div>
        <div className="flex min-w-0 flex-1 touch-pan-x items-center gap-1.5 overflow-x-auto overscroll-x-contain px-3 py-2 [scrollbar-width:none] sm:flex-none sm:justify-end sm:gap-2 sm:overflow-visible sm:px-4 [&::-webkit-scrollbar]:hidden">
          <Stat
            icon={Heart}
            label="Жизни"
            value={`${hud.lives}`}
            tone={hud.lives <= 5 ? "text-ember" : "text-fg"}
            pulse={hud.lives}
          />
          <Stat
            icon={Coins}
            label="Золото"
            value={hud.cheat ? "∞" : `${gold}`}
            tone="text-gold"
            pulse={hud.gold}
          />
          <Stat
            icon={Crosshair}
            label="Волна"
            value={
              hud.phase === "menu"
                ? `0/${hud.wavesTotal}`
                : hud.endless
                  ? `${hud.wave}/∞`
                  : `${Math.min(hud.wave, hud.wavesTotal)}/${hud.wavesTotal}`
            }
            tone="text-fg"
          />
          <IconButton label="Сыграть заново" onClick={sim.restart} disabled={hud.phase === "menu"}>
            <RotateCcw className="size-4" />
          </IconButton>
          <IconButton
            label={hud.paused ? "Продолжить" : "Пауза"}
            onClick={sim.togglePause}
            disabled={ended}
          >
            {hud.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </IconButton>
          <IconButton
            label={hud.speed === 1 ? "Ускорить" : "Обычная скорость"}
            onClick={sim.toggleSpeed}
            disabled={ended}
          >
            <span className="text-xs font-semibold">{hud.speed === 1 ? "1×" : "2×"}</span>
          </IconButton>
          <IconButton
            label={hud.aiming ? "Отменить обвал" : "Обвал Димона (Q)"}
            onClick={sim.toggleAim}
            disabled={ended}
            active={hud.aiming}
          >
            {hud.abilityLeft > 0 ? (
              <span className="text-xs font-semibold tabular-nums text-muted">
                {hud.abilityLeft}
              </span>
            ) : (
              <Mountain
                className={cx("size-4", hud.phase === "combat" && !hud.aiming && "text-gold")}
              />
            )}
          </IconButton>
          <IconButton
            label={hud.cheat ? "Выключить чит" : "Чит: бесконечное золото"}
            onClick={sim.toggleCheat}
            active={hud.cheat}
          >
            <InfinityIcon className="size-4" />
          </IconButton>
          <IconButton
            label={hud.muted ? "Включить звук" : "Выключить звук"}
            onClick={sim.toggleMute}
          >
            {hud.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-0 flex-1 basis-0">
          <canvas
            ref={canvasRef}
            data-testid="battlefield"
            aria-label={`Поле боя Димона, карта «${MAPS[hud.mapId].name}». Тропа ведёт от портала слева к его вратам.`}
            className={cx(
              "absolute inset-0 h-full w-full touch-none",
              hud.aiming && "cursor-crosshair",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onPointerLeave={() => sim.pointer(-1, -1, "leave")}
            onPointerMove={(event) => {
              const cell = cellFromEvent(event);
              sim.pointer(cell.col, cell.row, "move", cell.fx, cell.fy);
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              const cell = cellFromEvent(event);
              sim.pointer(cell.col, cell.row, "down", cell.fx, cell.fy);
            }}
          />
          {hud.banner && (
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-surface/95 px-4 py-1.5 text-sm text-gold">
              <span aria-live="polite">{hud.banner}</span>
            </div>
          )}
          {intro && (
            <div
              key={intro.key}
              className="pointer-events-none absolute inset-x-0 top-[22%] flex animate-wave-intro flex-col items-center px-4 text-center"
              aria-live="polite"
            >
              <p className="text-xs tracking-[0.3em] text-ember uppercase">Волна {intro.wave}</p>
              <p className="mt-1 font-display text-4xl leading-none text-gold drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-6xl">
                {intro.text}
              </p>
            </div>
          )}
          {hud.paused && !ended && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/35">
              <p className="font-display text-4xl text-gold">Пауза</p>
            </div>
          )}
          {hud.phase === "prep" && (
            <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3">
              <TutorialHint hud={hud} />
              <PrepTimer left={hud.prepLeft} />
              <button
                type="button"
                data-testid="call-wave"
                onClick={sim.callWave}
                className="inline-flex min-h-11 animate-call-glow items-center justify-center rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-bg"
              >
                {hud.earlyBonus > 0 ? `Вызвать волну · +${hud.earlyBonus}` : "Вызвать волну"}
              </button>
            </div>
          )}
          {hud.phase === "combat" && (
            <div
              className="absolute inset-x-4 bottom-3 h-1.5 overflow-hidden rounded-full bg-surface"
              aria-hidden="true"
            >
              <div className="h-full bg-gold" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>

        <aside className="flex max-h-[46%] shrink-0 flex-col gap-3 overflow-y-auto border-t border-line bg-surface p-3 lg:max-h-none lg:h-full lg:w-80 lg:border-t-0 lg:border-l lg:p-4">
          <DimonCard hud={hud} compact={Boolean(hud.selection)} />
          {hud.selection ? (
            <Inspector hud={hud} sim={sim} />
          ) : (
            <div className="rounded-2xl border border-line bg-bg px-3 py-3">
              <p className="text-xs tracking-[0.16em] text-muted uppercase">Дальше</p>
              <ul className="mt-2 flex flex-col gap-1">
                {hud.nextGroups.map((group) => (
                  <li key={group.kind} className="flex items-center justify-between text-sm">
                    <span>
                      {group.name}
                      {group.tag ? (
                        <span className="ml-2 text-xs text-muted">{group.tag}</span>
                      ) : null}
                    </span>
                    <span className="font-semibold tabular-nums text-gold">×{group.count}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 hidden text-xs leading-relaxed text-muted lg:block">
                Пустая клетка — башня Димона. Уже стоящая — урон, скорострельность и продажа.
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs tracking-[0.16em] text-muted uppercase">Арсенал Димона</p>
            <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-col">
              {TOWER_ORDER.map((kind) => {
                const def = TOWERS[kind];
                const Icon = ICONS[kind];
                const active = hud.build === kind;
                const poor = !hud.cheat && hud.gold < def.cost;
                return (
                  <button
                    key={kind}
                    type="button"
                    data-testid={`tower-${kind}`}
                    onClick={() => sim.selectBuild(kind)}
                    className={cx(
                      "flex min-h-14 w-full items-center gap-2 rounded-2xl border px-2 py-2 text-left lg:min-h-16 lg:gap-3",
                      active ? "border-gold bg-surface-2" : "border-line bg-bg",
                      poor && !active && "opacity-60",
                    )}
                  >
                    <img
                      src={`/sprites/${kind}.png`}
                      alt=""
                      className="size-10 shrink-0 object-contain lg:size-14"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-x-2">
                        <span className="flex items-center gap-1.5 text-sm font-semibold lg:text-base">
                          <Icon className="size-4 text-gold" aria-hidden="true" />
                          {def.name}
                        </span>
                        <span className="tabular-nums text-gold">{def.cost}</span>
                      </span>
                      <span className="mt-0.5 hidden text-xs leading-snug text-muted lg:block">
                        {def.blurb}
                      </span>
                      <span className="hidden lg:block">
                        <Traits def={def} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {ended && (
        <EndScreen
          hud={hud}
          onStart={sim.start}
          onRestart={sim.restart}
          onEndless={sim.continueEndless}
          onDifficulty={sim.setDifficulty}
          onMap={sim.setMap}
          onContinue={sim.continueRun}
        />
      )}
    </div>
  );
}

/** Три шага для первой игры; пропадает, когда первая волна пошла. */
function TutorialHint({ hud }: { hud: Hud }) {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    try {
      setSeen(localStorage.getItem(TUTORIAL_KEY) === "1");
    } catch {
      setSeen(true);
    }
  }, []);
  const done = () => {
    setSeen(true);
    try {
      localStorage.setItem(TUTORIAL_KEY, "1");
    } catch {
      /* private mode */
    }
  };
  if (seen || hud.endless || hud.wave > 1) return null;
  const text =
    hud.towerCount > 0
      ? "3. Готов? Нажми «Вызвать волну»"
      : hud.build
        ? "2. Коснись камня рядом с тропой"
        : "1. Выбери башню в арсенале. Начни с Лука";
  return (
    <div className="flex items-center gap-2 rounded-full border border-gold/50 bg-bg/90 py-1 pr-1 pl-3 text-xs text-gold">
      <span>{text}</span>
      <button
        type="button"
        onClick={done}
        aria-label="Скрыть подсказки"
        className="inline-flex size-7 items-center justify-center rounded-full text-muted"
      >
        ×
      </button>
    </div>
  );
}

/** Титр волны на пару секунд после её начала. */
function useFirstWaveDone(phase: string) {
  useEffect(() => {
    if (phase !== "combat") return;
    try {
      localStorage.setItem(TUTORIAL_KEY, "1");
    } catch {
      /* private mode */
    }
  }, [phase]);
}

function useWaveIntro(phase: string, wave: number) {
  const [intro, setIntro] = useState<{ wave: number; text: string; key: number } | null>(null);
  useEffect(() => {
    if (phase !== "combat") return;
    setIntro({ wave, text: dimonShout(wave), key: Date.now() });
    const timer = window.setTimeout(() => setIntro(null), 2400);
    return () => window.clearTimeout(timer);
  }, [phase, wave]);
  return intro;
}

/** Число плавно догоняет цель — золото «набегает», а не прыгает. */
function useTweened(target: number) {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    let frame = 0;
    const step = () => {
      const diff = target - shownRef.current;
      if (Math.abs(diff) < 1) {
        shownRef.current = target;
        setShown(target);
        return;
      }
      shownRef.current += diff * 0.2;
      setShown(Math.round(shownRef.current));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

function PrepTimer({ left }: { left: number | null }) {
  if (left === null) {
    return (
      <p className="rounded-full border border-line bg-bg/85 px-3 py-1 text-xs text-muted">
        Расставь башни. Волна ждёт твоего слова
      </p>
    );
  }
  const shown = Math.max(0, Math.ceil(left));
  const pct = Math.max(0, Math.min(1, left / PREP_SECONDS));
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-line bg-bg/85 py-1 pr-3 pl-1.5"
      role="timer"
      aria-label={`Волна через ${shown} с`}
    >
      <span className="relative inline-flex size-7 items-center justify-center">
        <svg viewBox="0 0 28 28" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="14" cy="14" r="12" fill="none" stroke="var(--color-line)" strokeWidth="3" />
          <circle
            cx="14"
            cy="14"
            r="12"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 12}
            strokeDashoffset={2 * Math.PI * 12 * (1 - pct)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <span className="relative text-xs font-semibold tabular-nums text-gold">{shown}</span>
      </span>
      <span className="text-xs text-fg">Волна пойдёт сама</span>
    </div>
  );
}

function Traits({ def }: { def: TowerDef }) {
  return (
    <span className="mt-1.5 flex flex-wrap gap-1">
      {towerTraits(def).map((trait) => (
        <span
          key={trait.label}
          className={cx(
            "rounded-full border px-1.5 py-px text-[11px] leading-4",
            trait.bad ? "border-ember/40 text-ember" : "border-moss/40 text-moss",
          )}
        >
          {trait.label}
        </span>
      ))}
    </span>
  );
}

function DimonCard({ hud, compact }: { hud: Hud; compact: boolean }) {
  const note = dimonNote(hud.phase, hud.wave, hud.lives);
  if (compact) {
    return (
      <p className="rounded-2xl border border-gold/30 bg-bg px-3 py-2 text-sm leading-snug text-fg">
        <span className="mr-2 text-xs tracking-[0.16em] text-gold uppercase">Димон</span>
        {note.title}
      </p>
    );
  }
  return (
    <section className="rounded-2xl border border-gold/30 bg-bg px-3 py-3">
      <p className="text-xs tracking-[0.16em] text-muted uppercase">Димон</p>
      <h2 className="mt-1 font-display text-2xl leading-none text-gold">{note.title}</h2>
      <p className="mt-2 hidden text-sm leading-relaxed text-fg lg:block">{note.text}</p>
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
  pulse,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: string;
  pulse?: number;
}) {
  return (
    <div
      className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 sm:px-3"
      aria-label={`${label}: ${value}`}
    >
      <Icon key={pulse} className={cx("size-4 animate-stat-pop", tone)} aria-hidden="true" />
      <span className={cx("text-sm font-semibold tabular-nums", tone)}>{value}</span>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-40",
        active ? "border-gold bg-gold text-bg" : "border-line bg-surface text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Inspector({ hud, sim }: { hud: Hud; sim: Sim }) {
  const selection = hud.selection!;
  return (
    <section className="rounded-2xl border border-gold/40 bg-bg px-3 py-3">
      <div className="flex items-start gap-3">
        <img src={`/sprites/${selection.kind}.png`} alt="" className="size-14 object-contain" />
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-none text-gold">{selection.name}</h2>
          <p className="mt-1 text-xs leading-snug text-muted">{selection.blurb}</p>
        </div>
      </div>
      <Traits def={TOWERS[selection.kind]} />
      {selection.support ? (
        <p className="mt-3 text-sm leading-snug text-fg">
          Дуга {selection.range}. Два знамени рядом складываются, третье уже не добавляет.
        </p>
      ) : (
        <p className="mt-3 text-sm text-fg">
          Урон {selection.damage}
          <span className="text-muted"> · </span>
          {selection.rate}/с
          <span className="text-muted"> · дуга {selection.range}</span>
        </p>
      )}
      {selection.buffed > 0 && (
        <p className="mt-1 text-xs text-gold">
          Усилена знаменем: +{selection.buffDmg}% урона, +{selection.buffRate}% скорости
          {selection.buffRange > 0 ? `, +${selection.buffRange}% дальности` : ""}
        </p>
      )}
      <Mastery selection={selection} gold={hud.cheat ? Number.POSITIVE_INFINITY : hud.gold} sim={sim} />
      {!selection.support && (
        <>
          <div className="mt-3">
            <p className="mb-1 text-xs tracking-[0.14em] text-muted uppercase">Кого бить</p>
            <div className="grid grid-cols-4 gap-1">
              {TARGETS.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => sim.setTarget(mode.id)}
                  className={cx(
                    "min-h-11 rounded-xl border px-1 text-xs font-semibold",
                    selection.target === mode.id
                      ? "border-gold bg-gold text-bg"
                      : "border-line bg-surface text-fg",
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <Upgrade
              label="Урон"
              rank={selection.dmgRank}
              cost={selection.dmgCost}
              gold={hud.cheat ? Number.POSITIVE_INFINITY : hud.gold}
              onClick={() => sim.upgrade("dmg")}
            />
            <Upgrade
              label="Скорострельность"
              rank={selection.rateRank}
              cost={selection.rateCost}
              gold={hud.cheat ? Number.POSITIVE_INFINITY : hud.gold}
              onClick={() => sim.upgrade("rate")}
            />
          </div>
        </>
      )}
      <button
        type="button"
        onClick={sim.sell}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold"
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        Продать за {selection.sell}
      </button>
    </section>
  );
}

/** Мастерство: после трёх улучшений башня выбирает один из двух путей навсегда. */
function Mastery({
  selection,
  gold,
  sim,
}: {
  selection: NonNullable<Hud["selection"]>;
  gold: number;
  sim: Sim;
}) {
  if (selection.spec) {
    return (
      <div
        className="mt-3 rounded-xl border px-3 py-2"
        style={{ borderColor: selection.spec.color }}
        data-testid="spec-chosen"
      >
        <p className="text-xs tracking-[0.14em] text-muted uppercase">Мастерство</p>
        <p className="font-display text-lg leading-tight" style={{ color: selection.spec.color }}>
          {selection.spec.name}
        </p>
        <p className="text-xs leading-snug text-muted">{selection.spec.blurb}</p>
      </div>
    );
  }
  if (!selection.specOpen) {
    if (selection.support) return null;
    return (
      <p className="mt-3 text-xs leading-snug text-muted">
        Мастерство откроется после {selection.specNeed} улучшений ({selection.ranks}/{selection.specNeed}).
      </p>
    );
  }
  const canPay = gold >= selection.specCost;
  return (
    <div className="mt-3" data-testid="spec-open">
      <p className="mb-1 flex items-baseline justify-between gap-2 text-xs tracking-[0.14em] text-muted uppercase">
        <span>Мастерство · навсегда</span>
        <span className={cx("tracking-normal tabular-nums", canPay ? "text-gold" : "text-muted")}>
          {selection.specCost}
        </span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        {selection.specs.map((item, index) => (
          <button
            key={item.id}
            type="button"
            data-testid={`spec-${item.id}`}
            onClick={() => sim.specialize(item.id)}
            className={cx(
              "flex min-h-11 flex-col items-start gap-0.5 rounded-xl border bg-surface px-2.5 py-2 text-left",
              canPay ? "" : "opacity-60",
            )}
            style={{ borderColor: item.color }}
          >
            <span className="font-display text-base leading-tight" style={{ color: item.color }}>
              {item.name}
              <span className="ml-1.5 hidden text-[11px] font-sans text-muted sm:inline">
                {index === 0 ? "Z" : "X"}
              </span>
            </span>
            <span className="text-[11px] leading-snug text-muted">{item.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Upgrade({
  label,
  rank,
  cost,
  gold,
  onClick,
}: {
  label: string;
  rank: number;
  cost: number | null;
  gold: number;
  onClick: () => void;
}) {
  const maxed = cost === null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={maxed}
      className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 text-sm disabled:opacity-50"
    >
      <span>
        <span className="font-semibold">{label}</span>
        <span
          className="ml-2 inline-flex gap-1 align-middle"
          aria-label={`уровень ${rank} из ${MAX_RANK}`}
        >
          {Array.from({ length: MAX_RANK }, (_, index) => (
            <span
              key={index}
              className={cx(
                "inline-block h-1.5 w-3 rounded-full",
                index < rank ? "bg-gold" : "bg-line",
              )}
            />
          ))}
        </span>
      </span>
      <span className={cx("tabular-nums", !maxed && gold >= cost ? "text-gold" : "text-muted")}>
        {maxed ? "Максимум" : cost}
      </span>
    </button>
  );
}

/** Карточка карты: мини-схема троп, название и рекорд при выбранной сложности. */
function MapCard({
  id,
  selected,
  best,
  onSelect,
}: {
  id: MapId;
  selected: boolean;
  best: number;
  onSelect: () => void;
}) {
  const def = MAPS[id];
  const toPoints = (corners: Array<[number, number]>) =>
    corners.map(([c, r]) => `${c + 0.5},${r + 0.5}`).join(" ");
  const gate = def.routes[0]![def.routes[0]!.length - 1]!;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid={`map-${id}`}
      onClick={onSelect}
      className={cx(
        "flex flex-col items-stretch gap-1 rounded-xl border p-1.5 text-left",
        selected ? "border-gold bg-surface-2" : "border-line bg-bg",
      )}
    >
      <svg viewBox="0 0 18 11" className="w-full rounded-md bg-[#141c18]" aria-hidden="true">
        {def.routes.map((corners, index) => (
          <polyline
            key={index}
            points={toPoints(corners)}
            fill="none"
            stroke={selected ? "var(--color-gold)" : "#6b5444"}
            strokeWidth="0.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {def.routes.map((corners, index) => (
          <circle
            key={index}
            cx={corners[0]![0] + 0.5}
            cy={corners[0]![1] + 0.5}
            r="0.55"
            fill="var(--color-ember)"
          />
        ))}
        <rect
          x={gate[0] + 0.1}
          y={gate[1] + 0.1}
          width="0.8"
          height="0.8"
          rx="0.2"
          fill="var(--color-gold)"
        />
      </svg>
      <span
        className={cx(
          "px-0.5 text-xs leading-tight font-semibold",
          selected ? "text-gold" : "text-fg",
        )}
      >
        {def.name}
      </span>
      <span className="px-0.5 text-[11px] leading-none tabular-nums text-muted">
        {best > 0 ? `рекорд: волна ${best}` : "без рекорда"}
      </span>
    </button>
  );
}

function EndScreen({
  hud,
  onStart,
  onRestart,
  onEndless,
  onDifficulty,
  onMap,
  onContinue,
}: {
  hud: Hud;
  onContinue: () => void;
  onStart: () => void;
  onRestart: () => void;
  onEndless: () => void;
  onDifficulty: (difficulty: Difficulty) => void;
  onMap: (id: MapId) => void;
}) {
  const victory = hud.phase === "victory";
  const defeat = hud.phase === "defeat";
  return (
    <div className="fixed inset-0 z-30 flex overflow-y-auto bg-bg/80 p-4">
      <div className="m-auto w-full max-w-md rounded-3xl border border-line bg-surface px-5 py-6 text-center shadow-2xl sm:px-6 sm:py-7">
        <p className="text-xs tracking-[0.22em] text-muted uppercase">
          {victory ? "Смена сдана" : defeat ? "Дыра в воротах" : "Хозяин врат"}
        </p>
        <h2 className="mt-2 font-display text-5xl leading-none text-gold">
          {victory ? "Димон устоял" : defeat ? "Димон пал" : "Дозор Димона"}
        </h2>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted">
          {victory
            ? `Двенадцать волн разбились о Димона. Убито ${hud.killed}. Дальше — бесконечная ночь: каждая волна толще прошлой, конец один, вопрос — когда.`
            : defeat && hud.endless
              ? `Бесконечная ночь взяла своё на волне ${hud.wave}. Димон продержался ${hud.cleared} волн. Убито ${hud.killed}.`
              : defeat
                ? `Волна ${hud.wave} дошла до врат. Димон это запомнил. Убито ${hud.killed}, пропущено ${hud.leaked}.`
                : "Димон стережёт пепельную тропу. Его золото капает с убитых. Башни ставь на камень, не на дорогу, и улучшай урон со скорострельностью."}
        </p>
        {!victory && !defeat && (
          <ul className="mx-auto mt-4 max-w-sm space-y-1 text-left text-sm text-fg">
            <li>Жар бьёт по площади, но не достаёт летунов.</li>
            <li>Латники держат броню — её пробивает баллиста.</li>
            <li>Знахари лечат тварей вокруг — бей их первыми.</li>
            <li>Обвал Димона (Q) бьёт по области раз в 24 секунды.</li>
          </ul>
        )}
        <div className="mt-5">
          <p className="mb-1.5 text-xs tracking-[0.16em] text-muted uppercase">Карта</p>
          <div
            className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
            role="radiogroup"
            aria-label="Карта"
          >
            {MAP_ORDER.map((id) => (
              <MapCard
                key={id}
                id={id}
                selected={hud.mapId === id}
                best={hud.mapBest[id]}
                onSelect={() => onMap(id)}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">{MAPS[hud.mapId].blurb}</p>
        </div>
        <div className="mt-4">
          <p className="mb-1.5 text-xs tracking-[0.16em] text-muted uppercase">Сложность</p>
          <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Сложность">
            {DIFFICULTY_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={hud.difficulty === id}
                data-testid={`difficulty-${id}`}
                onClick={() => onDifficulty(id)}
                className={cx(
                  "min-h-11 rounded-xl border px-1 text-xs leading-tight font-semibold",
                  hud.difficulty === id
                    ? "border-gold bg-gold text-bg"
                    : "border-line bg-bg text-fg",
                )}
              >
                {DIFFICULTIES[id].label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">{DIFFICULTIES[hud.difficulty].blurb}</p>
        </div>
        {victory && (
          <button
            type="button"
            data-testid="endless"
            onClick={onEndless}
            className="mt-5 inline-flex min-h-12 w-full animate-call-glow items-center justify-center rounded-full bg-ember px-5 text-base font-semibold text-fg"
          >
            Дальше — бесконечная ночь
          </button>
        )}
        {hud.phase === "menu" && hud.savedRun && (
          <button
            type="button"
            data-testid="continue-run"
            onClick={onContinue}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gold px-5 text-base font-semibold text-bg"
          >
            Продолжить: волна {hud.savedRun.wave}
            {hud.savedRun.endless ? " · бесконечная ночь" : ` · ${MAPS[hud.savedRun.mapId].name}`}
          </button>
        )}
        <button
          type="button"
          data-testid="restart"
          onClick={victory || defeat ? onRestart : onStart}
          className={cx(
            "inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-base font-semibold",
            victory || (hud.phase === "menu" && hud.savedRun)
              ? "mt-2 border border-line bg-bg text-fg"
              : "mt-5 bg-gold text-bg",
          )}
        >
          {victory || defeat ? "Сыграть снова" : "Встать за Димона"}
        </button>
        <p className="mt-3 text-xs text-muted">
          {MAPS[hud.mapId].name} · {hud.livesTotal} жизней · {hud.goldTotal} золота ·{" "}
          {hud.wavesTotal} волн
          {hud.bestWave > 0 ? ` · лучшая волна ${hud.bestWave}` : ""}
          {hud.wins > 0 ? ` · побед ${hud.wins}` : ""}
        </p>
        <p className="mt-1 hidden text-xs text-muted sm:block">
          1–6 выбирают башню, Q — обвал, пробел вызывает волну, P — пауза
        </p>
      </div>
    </div>
  );
}
