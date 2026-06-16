import { useEffect, useRef, useState, useCallback } from "react";
import { GameEngine, VIEW_W, VIEW_H, LEVELS } from "@/game/engine";
import type { HudState } from "@/game/engine";
import type { Stats, Speaker, MemoryEntry } from "@/game/types";
import { SUN_STAGES } from "@/game/levels";
import { audio } from "@/game/audio";
import Cinematic from "./Cinematic";

type Screen =
  | "title"
  | "intro"
  | "playing"
  | "death"
  | "levelComplete"
  | "ending"
  | "credits"
  | "secret";

const MOVE_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "Space",
]);

/* A small reusable bat glyph used throughout the UI (NOX, shields). */
function Bat({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
    >
      <path
        d="M16 9c1.4-2.4 3.2-3.6 4.4-1.8.4-2 2.4-2.6 3-0.8.5 1.4 0 3 .2 4.4 2.2-1 4.6.2 5.4 2.2-2.4-.6-4.2.4-5.2 2.2-1.6 2.8-4.2 4.4-7 4.4s-5.4-1.6-7-4.4c-1-1.8-2.8-2.8-5.2-2.2.8-2 3.2-3.2 5.4-2.2.2-1.4-.3-3 .2-4.4.6-1.8 2.6-1.2 3 .8 1.2-1.8 3-.6 4.4 1.8z"
        fill="currentColor"
      />
      <circle cx="13" cy="12.5" r="1.1" fill="#ffe14d" />
      <circle cx="19" cy="12.5" r="1.1" fill="#ffe14d" />
    </svg>
  );
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [screen, setScreen] = useState<Screen>("intro");
  const [hud, setHud] = useState<HudState | null>(null);
  const [dialogue, setDialogue] = useState<string[]>([]);
  const [speaker, setSpeaker] = useState<Speaker>("nox");
  const [muted, setMuted] = useState(false);
  const [levelIndex, setLevelIndex] = useState(0);
  const [completedIndex, setCompletedIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const dialogueTimer = useRef<number | null>(null);

  const showDialogue = useCallback((lines: string[], who: Speaker = "nox") => {
    setSpeaker(who);
    setDialogue(lines);
    if (dialogueTimer.current) window.clearTimeout(dialogueTimer.current);
    dialogueTimer.current = window.setTimeout(
      () => setDialogue([]),
      2600 + lines.join(" ").length * 30,
    );
  }, []);

  // init engine once canvas exists
  useEffect(() => {
    if (!canvasRef.current || engineRef.current) return;
    const engine = new GameEngine(canvasRef.current, {
      onHud: (h) => setHud(h),
      onDeath: () => setScreen("death"),
      onLevelComplete: (idx) => {
        setCompletedIndex(idx);
        setScreen("levelComplete");
      },
      onDialogue: showDialogue,
      onEnding: () => setScreen("ending"),
    });
    engineRef.current = engine;
  }, [showDialogue]);

  const toggleMute = useCallback(() => {
    const m = !audio.muted;
    audio.setMuted(m);
    setMuted(m);
  }, []);

  const togglePause = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    setPaused((prev) => {
      const next = !prev;
      eng.setPaused(next);
      return next;
    });
  }, []);

  // keyboard
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      if (MOVE_KEYS.has(e.code)) {
        e.preventDefault();
        eng.setKey(e.code, true);
        if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") eng.jump();
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "KeyJ") {
        e.preventDefault();
        eng.activateShield();
      }
      if (e.code === "KeyM") toggleMute();
      if (e.code === "KeyP" && screen === "playing") togglePause();
    };
    const onUp = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      if (MOVE_KEYS.has(e.code)) eng.setKey(e.code, false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [screen, toggleMute, togglePause]);

  const startLevel = useCallback((idx: number) => {
    audio.resume();
    setLevelIndex(idx);
    setScreen("playing");
    setPaused(false);
    setDialogue([]);
    requestAnimationFrame(() => engineRef.current?.start(idx));
  }, []);

  const startGame = useCallback(() => {
    const eng = engineRef.current;
    if (eng) {
      eng.collected = new Set();
      eng.collectedMemories = [];
      eng.shields = 0;
      eng.globalStats.memoryFound = 0;
      eng.globalStats.tokensFound = 0;
      eng.globalStats.postcardsFound = 0;
      eng.globalStats.notesFound = 0;
    }
    startLevel(0);
  }, [startLevel]);

  const retry = () => startLevel(levelIndex);
  const nextLevel = () => startLevel(completedIndex + 1);

  // responsive canvas scaling
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const onResize = () => {
      if (!wrapRef.current) return;
      const w = wrapRef.current.clientWidth;
      const h = wrapRef.current.clientHeight;
      setScale(Math.min(w / VIEW_W, h / VIEW_H));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (screen === "intro") {
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-[#070512] text-white select-none">
        <Cinematic onDone={() => setScreen("title")} />
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0c0a1a] text-white select-none">
      <div ref={wrapRef} className="absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ width: VIEW_W * scale, height: VIEW_H * scale }}>
          <canvas
            ref={canvasRef}
            width={VIEW_W}
            height={VIEW_H}
            className="absolute left-0 top-0 origin-top-left rounded-lg shadow-2xl"
            style={{ transform: `scale(${scale})` }}
          />

          {/* HUD + screens overlay, scaled to match the canvas */}
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: VIEW_W, height: VIEW_H, transform: `scale(${scale})` }}
          >
            {screen === "playing" && hud && (
              <Hud hud={hud} muted={muted} onMute={toggleMute} onPause={togglePause} paused={paused} />
            )}

            {dialogue.length > 0 && screen === "playing" && (
              <DialogueBox lines={dialogue} speaker={speaker} />
            )}

            {screen === "title" && <TitleScreen onStart={startGame} muted={muted} onMute={toggleMute} />}
            {screen === "death" && (
              <DeathScreen onRetry={retry} levelName={LEVELS[levelIndex].theme.name} />
            )}
            {screen === "levelComplete" && hud && (
              <LevelCompleteScreen
                hud={hud}
                levelName={LEVELS[completedIndex].theme.name}
                onNext={nextLevel}
              />
            )}
            {screen === "ending" && hud && (
              <EndingScreen
                stats={hud.globalStats}
                memories={engineRef.current?.collectedMemories ?? []}
                onCredits={() => setScreen("credits")}
              />
            )}
            {screen === "credits" && (
              <CreditsScreen
                secretUnlocked={engineRef.current?.allNotesFound() ?? false}
                onTitle={() => setScreen("title")}
                onSecret={() => setScreen("secret")}
              />
            )}
            {screen === "secret" && (
              <SecretScreen onTitle={() => setScreen("title")} />
            )}
            {paused && screen === "playing" && <PauseScreen onResume={togglePause} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- HUD ------------------------------- */
function Hud({
  hud,
  muted,
  onMute,
  onPause,
  paused,
}: {
  hud: HudState;
  muted: boolean;
  onMute: () => void;
  onPause: () => void;
  paused: boolean;
}) {
  const energyColor = hud.energy > 55 ? "#7fd1c4" : hud.energy > 25 ? "#ffd36b" : "#ff5a4f";
  return (
    <div className="pointer-events-none absolute inset-0 p-3 font-sans">
      {/* energy meter top-left */}
      <div className="absolute left-3 top-3 w-52">
        <div className="mb-1 text-[11px] font-bold tracking-widest text-white/90 drop-shadow">
          {hud.shieldActive ? "SHIELDED" : hud.inShade ? "IN SHADE" : "IN SUNLIGHT"}
        </div>
        <div className="h-4 w-full overflow-hidden rounded-full border border-white/40 bg-black/40 shadow">
          <div
            className="h-full rounded-full transition-[width] duration-100"
            style={{ width: `${hud.energy}%`, backgroundColor: energyColor }}
          />
        </div>
        <div className="mt-1 flex items-center gap-1 text-[10px] text-white/80">
          {Array.from({ length: hud.shields }).map((_, i) => (
            <Bat key={i} size={16} className="text-violet-300" />
          ))}
          {hud.shields === 0 && <span className="opacity-60">no shields — find bat tokens</span>}
        </div>
      </div>

      {/* solstice sun tracker top-center */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 text-center">
        <div className="rounded-full border border-white/30 bg-black/35 px-4 py-1 shadow">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">
            June Solstice · {SUN_STAGES[Math.min(hud.sunStage - 1, SUN_STAGES.length - 1)]}
          </div>
          <SunTrack stage={hud.sunStage} />
        </div>
      </div>

      {/* controls top-right */}
      <div className="pointer-events-auto absolute right-3 top-3 flex gap-2">
        <button
          onClick={onPause}
          className="rounded-md border border-white/30 bg-black/40 px-3 py-1 text-[11px] font-bold hover:bg-black/60"
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          onClick={onMute}
          className="rounded-md border border-white/30 bg-black/40 px-3 py-1 text-[11px] font-bold hover:bg-black/60"
        >
          {muted ? "Sound off" : "Sound on"}
        </button>
      </div>

      {/* level name + hint bottom-left */}
      <div className="absolute bottom-3 left-3 max-w-sm">
        <div className="text-sm font-black tracking-wide text-white drop-shadow">{hud.levelName}</div>
        <div className="text-[11px] text-white/70">{hud.levelSubtitle}</div>
      </div>

      {/* collectible counter bottom-right */}
      <div className="absolute bottom-3 right-3 text-right text-[11px] text-white/85">
        <div>★ {hud.globalStats.memoryFound}/{hud.globalStats.memoryTotal} Solstice Memories</div>
        <div className="opacity-80">✉ postcards {hud.globalStats.postcardsFound}</div>
        {hud.globalStats.notesFound > 0 && (
          <div className="text-teal-300/90">
            ⧉ Encrypted Notes {hud.globalStats.notesFound}/{hud.globalStats.notesTotal}
          </div>
        )}
      </div>

      {/* control hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center text-[10px] text-white/55">
        ← → / A D move · ↑ / Space jump · Shift / J bat shield · M mute · P pause
      </div>
    </div>
  );
}

function SunTrack({ stage }: { stage: number }) {
  const pct = Math.min(1, (stage - 1) / 5);
  return (
    <div className="relative mt-1 h-2 w-44 rounded-full bg-gradient-to-r from-sky-300 via-amber-300 to-orange-500">
      <div
        className="absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-yellow-200 shadow"
        style={{ left: `${pct * 100}%` }}
      />
    </div>
  );
}

/* ----------------------------- Dialogue ---------------------------- */
function DialogueBox({ lines, speaker }: { lines: string[]; speaker: Speaker }) {
  const isSun = speaker === "sun";
  return (
    <div className="pointer-events-none absolute bottom-16 left-1/2 w-[80%] max-w-xl -translate-x-1/2">
      <div
        className={
          isSun
            ? "rounded-2xl border border-amber-300/50 bg-[#2a1e08]/90 p-3 shadow-xl backdrop-blur"
            : "rounded-2xl border border-violet-300/40 bg-[#1a1230]/90 p-3 shadow-xl backdrop-blur"
        }
      >
        <div className="flex items-start gap-3">
          {isSun ? (
            <span className="mt-0.5 shrink-0 text-2xl leading-none text-amber-300" aria-hidden>
              ☼
            </span>
          ) : (
            <Bat size={26} className="mt-0.5 shrink-0 text-violet-200" />
          )}
          <div className="space-y-0.5">
            <div
              className={
                isSun
                  ? "text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80"
                  : "text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/80"
              }
            >
              {isSun ? "The Sun" : "NOX"}
            </div>
            {lines.map((l, i) => (
              <p
                key={i}
                className={isSun ? "text-sm leading-snug text-amber-50" : "text-sm leading-snug text-violet-100"}
              >
                {l}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Screens ---------------------------- */
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
      {children}
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 py-3 text-lg font-black tracking-wide text-white shadow-lg transition hover:scale-105 hover:from-violet-400 hover:to-fuchsia-400 active:scale-95"
    >
      {children}
    </button>
  );
}

function TitleScreen({
  onStart,
  muted,
  onMute,
}: {
  onStart: () => void;
  muted: boolean;
  onMute: () => void;
}) {
  return (
    <Overlay>
      <div className="max-w-lg px-6 text-center">
        <Bat size={72} className="mx-auto mb-2 text-violet-200" />
        <h1 className="bg-gradient-to-b from-violet-200 to-fuchsia-400 bg-clip-text text-5xl font-black leading-tight text-transparent drop-shadow">
          Long Day,
          <br />
          Tiny Vampire
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-violet-100/80">
          It's the June Solstice — the longest day of the year. Our tiny vampire is caught far from
          home as the sun refuses to set. Dodge the daylight, hide in the shade, and race the sun
          across six festival-filled stops. NOX the bat has your back. Mostly.
        </p>
        <div className="mt-7 flex flex-col items-center gap-3">
          <PrimaryButton onClick={onStart}>Begin the Long Day</PrimaryButton>
          <button
            onClick={onMute}
            className="text-xs text-violet-200/70 underline-offset-2 hover:underline"
          >
            Sound: {muted ? "off" : "on"} (M)
          </button>
        </div>
        <p className="mt-6 text-[11px] text-violet-200/50">
          Move ← → · Jump ↑ / Space · Bat Shield Shift / J
        </p>
      </div>
    </Overlay>
  );
}

function DeathScreen({ onRetry, levelName }: { onRetry: () => void; levelName: string }) {
  return (
    <Overlay>
      <div className="max-w-md px-6 text-center">
        <div className="mb-2 text-5xl text-orange-300">☼</div>
        <h2 className="text-3xl font-black text-orange-300">A Pile of Ash</h2>
        <p className="mt-3 text-sm text-violet-100/80">
          The sun got the better of you in {levelName}. Don't worry — vampires are dramatic but
          resilient.
        </p>
        <div className="mt-6">
          <PrimaryButton onClick={onRetry}>Reform & Retry</PrimaryButton>
        </div>
      </div>
    </Overlay>
  );
}

function LevelCompleteScreen({
  hud,
  levelName,
  onNext,
}: {
  hud: HudState;
  levelName: string;
  onNext: () => void;
}) {
  return (
    <Overlay>
      <div className="max-w-md px-6 text-center">
        <div className="mb-2 text-5xl text-violet-200">☾</div>
        <h2 className="text-3xl font-black text-violet-200">{levelName}</h2>
        <p className="mt-1 text-sm font-bold uppercase tracking-widest text-fuchsia-300">
          Stage Cleared
        </p>
        <div className="mx-auto mt-5 w-64 space-y-1 rounded-xl border border-white/10 bg-black/30 p-4 text-left text-sm text-violet-100/90">
          <Row label="★ Memories" value={`${hud.stats.memoryFound}/${hud.stats.memoryTotal}`} />
          <Row label="✉ Postcards" value={`${hud.stats.postcardsFound}/${hud.stats.postcardsTotal}`} />
          <Row label="Bat tokens" value={`${hud.stats.tokensFound}`} />
          <Row
            label="⧉ Encrypted Note"
            value={hud.stats.notesTotal === 0 ? "—" : hud.stats.notesFound > 0 ? "Found!" : "Hidden…"}
          />
        </div>
        <div className="mt-6">
          <PrimaryButton onClick={onNext}>Onward →</PrimaryButton>
        </div>
      </div>
    </Overlay>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="opacity-80">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

const SUNSET_BEATS: { who: "sun" | "nox" | "narrator"; text: string }[] = [
  { who: "sun", text: "You made it, little one. The longest day is finally ending." },
  { who: "narrator", text: "The sun slips below the rooftops, gold turning to violet." },
  { who: "nox", text: "Home. Your coffin's right where you left it." },
  { who: "narrator", text: "He pulls the blanket up. The lid settles closed with a soft click." },
  { who: "sun", text: "Goodnight. Rest well — I'll keep tomorrow waiting." },
];

function EndingScreen({
  stats,
  memories,
  onCredits,
}: {
  stats: Stats;
  memories: MemoryEntry[];
  onCredits: () => void;
}) {
  const [beat, setBeat] = useState(0);
  const done = beat >= SUNSET_BEATS.length;

  useEffect(() => {
    if (done) return;
    const id = window.setTimeout(() => setBeat((b) => b + 1), 3200);
    return () => window.clearTimeout(id);
  }, [beat, done]);

  if (!done) {
    const b = SUNSET_BEATS[beat];
    const tone =
      b.who === "sun" ? "text-amber-200" : b.who === "nox" ? "text-violet-200" : "text-violet-100/80";
    return (
      <Overlay>
        <div className="max-w-lg px-8 text-center">
          <div className="mb-6 text-5xl text-amber-200">☼</div>
          {b.who !== "narrator" && (
            <div
              className={`mb-2 text-[11px] font-bold uppercase tracking-[0.3em] ${b.who === "sun" ? "text-amber-300/80" : "text-violet-300/80"}`}
            >
              {b.who === "sun" ? "The Sun" : "NOX"}
            </div>
          )}
          <p className={`mx-auto max-w-md text-lg leading-relaxed ${tone} ${b.who === "narrator" ? "italic" : "font-semibold"}`}>
            {b.text}
          </p>
          <div className="mt-8 flex justify-center gap-1.5">
            {SUNSET_BEATS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i <= beat ? "bg-amber-300" : "bg-white/20"}`}
              />
            ))}
          </div>
          <button
            onClick={() => setBeat(SUNSET_BEATS.length)}
            className="mt-6 text-xs text-violet-200/60 underline-offset-2 hover:underline"
          >
            Skip →
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay>
      <div className="max-h-[92%] max-w-lg overflow-y-auto px-6 py-4 text-center">
        <div className="mb-2 text-5xl text-amber-200">☼</div>
        <h2 className="text-4xl font-black text-amber-200">Survived the Longest Day</h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-violet-100/85">
          The sun finally dips below the rooftops. Our tiny vampire slips through the coffin lid,
          exhausted and a little sunburnt, and NOX flutters down beside him. The longest day is over.
          "Told you we'd make it," NOX whispers. "Now — about tomorrow…"
        </p>

        <div className="mx-auto mt-5 max-w-md rounded-xl border border-amber-200/20 bg-black/30 p-4 text-left">
          <div className="mb-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-amber-200/90">
            The Solstice Scrapbook · {stats.memoryFound}/{stats.memoryTotal}
          </div>
          {memories.length === 0 ? (
            <p className="py-2 text-center text-sm text-violet-100/70">
              No memories pressed between these pages — yet. They're still out there in the shade.
            </p>
          ) : (
            <ul className="space-y-2">
              {memories.map((m) => (
                <li key={m.id} className="flex gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 text-amber-300">★</span>
                  <span>
                    <span className="font-bold text-amber-100">{m.label}</span>
                    {m.desc && <span className="block text-violet-100/75">{m.desc}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mx-auto mt-4 w-72 space-y-1 rounded-xl border border-white/10 bg-black/30 p-4 text-left text-sm text-violet-100/90">
          <Row label="✉ Postcards" value={`${stats.postcardsFound}/${stats.postcardsTotal}`} />
          <Row label="⧉ Encrypted Notes" value={`${stats.notesFound}/${stats.notesTotal}`} />
        </div>
        <div className="mt-6">
          <PrimaryButton onClick={onCredits}>Paths Not Taken</PrimaryButton>
        </div>
      </div>
    </Overlay>
  );
}

function CreditsScreen({
  secretUnlocked,
  onTitle,
  onSecret,
}: {
  secretUnlocked: boolean;
  onTitle: () => void;
  onSecret: () => void;
}) {
  const stops = [
    "Sushi District — moving shadows",
    "Sunny Boardwalk — flip-flop catapults",
    "Parade Route — the rainbow bridge",
    "Turing's Garden — the cipher gate",
    "Heatwave Plaza — the longest afternoon",
    "Sunset — the walk home",
  ];
  return (
    <Overlay>
      <div className="max-w-lg px-6 text-center">
        <h2 className="text-3xl font-black text-violet-200">Paths Not Taken</h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-violet-100/80">
          Every festival hid a postcard from the coffin and a glowing Solstice Memory. Some you
          found; some are still out there, waiting in the shade for another long day. Replay any time
          to chase the ones that got away.
        </p>
        <ul className="mx-auto mt-5 max-w-xs space-y-1 text-left text-sm text-violet-100/80">
          {stops.map((s) => (
            <li key={s}>☾ {s}</li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-violet-200/60">
          A wholesome little game about a tiny vampire and a very long day.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          {secretUnlocked && (
            <button
              onClick={onSecret}
              className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 px-8 py-3 text-lg font-black tracking-wide text-white shadow-lg transition hover:scale-105 active:scale-95"
            >
              Decode the Notes…
            </button>
          )}
          <PrimaryButton onClick={onTitle}>Back to Title</PrimaryButton>
        </div>
      </div>
    </Overlay>
  );
}

function SecretScreen({ onTitle }: { onTitle: () => void }) {
  return (
    <Overlay>
      <div className="max-h-[92%] max-w-lg overflow-y-auto px-6 py-4 text-center">
        <div className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-teal-300/80">
          Achievement Unlocked
        </div>
        <h2 className="text-3xl font-black text-teal-200">THE CODEBREAKER</h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-violet-100/85">
          You gathered every Encrypted Note hidden across the long day. Laid side by side, the
          strange symbols resolve into a single message — left in a quiet garden, long ago, for
          anyone patient enough to listen.
        </p>
        <blockquote className="mx-auto mt-5 max-w-md rounded-xl border border-teal-300/30 bg-black/40 p-5 text-left text-sm leading-relaxed text-teal-100">
          "We can only see a short distance ahead, but we can see plenty there that needs to be
          done."
          <span className="mt-3 block text-right text-xs text-teal-300/70">— for Alan Turing</span>
        </blockquote>
        <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-violet-100/60">
          Some puzzles outlive their makers. Thank you for solving this one.
        </p>
        <div className="mt-6">
          <PrimaryButton onClick={onTitle}>Back to Title</PrimaryButton>
        </div>
      </div>
    </Overlay>
  );
}

function PauseScreen({ onResume }: { onResume: () => void }) {
  return (
    <Overlay>
      <div className="text-center">
        <h2 className="text-3xl font-black text-violet-200">Paused</h2>
        <p className="mt-2 text-sm text-violet-100/70">Take a breath. The sun can wait.</p>
        <div className="mt-6">
          <PrimaryButton onClick={onResume}>Resume</PrimaryButton>
        </div>
      </div>
    </Overlay>
  );
}
