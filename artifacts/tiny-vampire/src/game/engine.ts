import type {
  Level,
  Platform,
  Rect,
  Collectible,
  Stats,
  Speaker,
  MemoryEntry,
} from "./types";
import { LEVELS } from "./levels";
import { audio } from "./audio";

const VIEW_W = 960;
const VIEW_H = 540;
const GRAVITY = 1900;
const MOVE = 240;
const JUMP_V = 640;
const PLAYER_W = 26;
const PLAYER_H = 34;
const SHIELD_TIME = 5;
const MAX_ENERGY = 100;

function rectsOverlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export type HudState = {
  energy: number;
  shields: number;
  shieldActive: boolean;
  shieldTime: number;
  inShade: boolean;
  sunStage: number;
  levelName: string;
  levelSubtitle: string;
  hint: string;
  stats: Stats;
  globalStats: Stats;
  warmth: number; // 0..1 how warm the lighting is
};

export type EngineCallbacks = {
  onHud: (h: HudState) => void;
  onDeath: () => void;
  onLevelComplete: (levelIndex: number) => void;
  onDialogue: (lines: string[], speaker?: Speaker) => void;
  onEnding: () => void;
};

type Keys = { [k: string]: boolean };

export class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cb: EngineCallbacks;

  levelIndex = 0;
  level!: Level;
  raf = 0;
  last = 0;
  running = false;
  paused = false;
  time = 0;

  // player
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  onGround = false;
  facing = 1;
  energy = MAX_ENERGY;
  shields = 0;
  shieldActive = false;
  shieldTimer = 0;
  dead = false;
  ashTimer = 0;
  inShade = false;
  walkAnim = 0;

  // camera
  camX = 0;
  camY = 0;

  // collectibles state, by id, persists across the run
  collected = new Set<string>();
  globalStats: Stats = {
    memoryTotal: 0,
    memoryFound: 0,
    tokensFound: 0,
    postcardsTotal: 0,
    postcardsFound: 0,
    notesTotal: 0,
    notesFound: 0,
  };
  // Solstice Memories collected this run, for the ending scrapbook
  collectedMemories: MemoryEntry[] = [];
  collectedPostcards: MemoryEntry[] = [];

  // one-shot narration flags (reset per life / per level)
  criticalFired = false;
  // time-scheduled narration (Sun lines, time-of-day NOX quips)
  scheduled: { at: number; lines: string[]; speaker: Speaker }[] = [];
  // daydream (low-energy hallucination) state
  daydreamTimer = 0;
  daydreamCooldown = 0;
  // chromesthesia color ripples (Pride parade — color you can hear)
  ripples: { x: number; y: number; r: number; max: number; life: number; ttl: number; color: string }[] = [];

  // checkpoint
  respawn = { x: 0, y: 0 };

  // puzzle state
  seqProgress = 0;
  bridgeBuilt: Rect[] = [];
  leverState: boolean[] = [];
  // cipher puzzle is reshuffled every load: target pattern + which rune each lever shows
  leverWant: boolean[] = [];
  leverSymbols: string[] = [];
  leverPlaqueOrder: number[] = [];
  gateOpen = false;

  keys: Keys = {};
  particles: { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }[] = [];

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.cb = cb;
    this.computeTotals();
  }

  computeTotals() {
    let memory = 0;
    let postcards = 0;
    let notes = 0;
    for (const lvl of LEVELS) {
      for (const c of lvl.collectibles) {
        if (c.kind === "memory") memory++;
        else if (c.kind === "postcard") postcards++;
        else if (c.kind === "note") notes++;
      }
    }
    this.globalStats.memoryTotal = memory;
    this.globalStats.postcardsTotal = postcards;
    this.globalStats.notesTotal = notes;
  }

  /** True once every Encrypted Note has been collected (unlocks the secret ending). */
  allNotesFound(): boolean {
    return this.globalStats.notesTotal > 0 && this.globalStats.notesFound >= this.globalStats.notesTotal;
  }

  start(levelIndex: number) {
    this.levelIndex = levelIndex;
    this.loadLevel();
    this.running = true;
    this.paused = false;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
    audio.playMusic(this.level.theme.music);
  }

  loadLevel() {
    this.level = LEVELS[this.levelIndex];
    this.px = this.level.spawn.x;
    this.py = this.level.spawn.y;
    this.vx = 0;
    this.vy = 0;
    this.energy = MAX_ENERGY;
    this.shieldActive = false;
    this.shieldTimer = 0;
    this.dead = false;
    this.ashTimer = 0;
    this.respawn = { x: this.level.spawn.x, y: this.level.spawn.y };
    this.time = 0;
    this.seqProgress = 0;
    this.bridgeBuilt = [];
    this.gateOpen = false;
    this.leverState = (this.level.levers || []).map(() => false);
    // reshuffle the cipher puzzle so Turing's Garden differs every play
    if (this.level.puzzle === "levers" && this.level.levers) {
      const n = this.level.levers.length;
      const pool = ["△", "◇", "◯", "☆", "▽", "□", "✶"];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      this.leverSymbols = pool.slice(0, n);
      const want = this.level.levers.map(() => Math.random() < 0.5);
      if (!want.some(Boolean)) want[Math.floor(Math.random() * n)] = true;
      this.leverWant = want;
      const order = this.level.levers.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      this.leverPlaqueOrder = order;
    } else {
      this.leverSymbols = [];
      this.leverWant = [];
      this.leverPlaqueOrder = [];
    }
    this.particles = [];
    // reset moving platform offsets
    for (const p of [...this.level.platforms, ...this.level.movingShade]) {
      p._ox = 0;
      p._oy = 0;
    }
    // reset all mutable per-level state so retries / replays behave deterministically
    for (const cp of this.level.checkpoints) cp.reached = false;
    for (const d of this.level.dialogue) d.fired = false;
    if (this.level.seqPads) for (const pad of this.level.seqPads) pad.active = false;
    if (this.level.levers) for (const lv of this.level.levers) {
      lv._cool = false;
      lv.on = false;
    }
    if (this.level.npcs) for (const n of this.level.npcs) n._fired = false;
    if (this.level.gate) this.level.gate.open = false;
    // reset narration / hallucination state
    this.criticalFired = false;
    this.daydreamTimer = 0;
    this.daydreamCooldown = 3;
    this.scheduled = [];
    this.ripples = [];
    // intro dialogue (NOX)
    const intro = this.level.dialogue.find((d) => d.id.endsWith("d0"));
    if (intro) {
      this.cb.onDialogue(intro.lines, "nox");
      intro.fired = true;
    }
    // the Sun comments on the journey a beat later, then NOX reacts to the time of day
    const sun = this.level.theme.sunLine;
    if (sun) this.scheduled.push({ at: 5.2, lines: [sun], speaker: "sun" });
    const noxTime = this.noxTimeLine();
    if (noxTime) this.scheduled.push({ at: 8.8, lines: [noxTime], speaker: "nox" });
  }

  /** NOX's quip keyed to how far through the day we are. */
  private noxTimeLine(): string | null {
    switch (this.level.theme.sunStage) {
      case 1:
        return "NOX: We've got plenty of time.";
      case 3:
        return "NOX: We absolutely do not have plenty of time.";
      case 4:
        return "NOX: I miss darkness.";
      case 6:
        return "NOX: Home is close.";
      default:
        return null;
    }
  }

  /** fire any time-scheduled narration lines that have come due */
  private fireScheduled() {
    if (!this.scheduled.length) return;
    const due = this.scheduled.filter((s) => s.at <= this.time);
    if (!due.length) return;
    this.scheduled = this.scheduled.filter((s) => s.at > this.time);
    for (const s of due) this.cb.onDialogue(s.lines, s.speaker);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (!p) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  setKey(code: string, down: boolean) {
    this.keys[code] = down;
  }

  activateShield() {
    if (this.shields > 0 && !this.shieldActive && !this.dead) {
      this.shields--;
      this.shieldActive = true;
      this.shieldTimer = SHIELD_TIME;
      audio.shield();
      this.spawnParticles(this.px + PLAYER_W / 2, this.py + PLAYER_H / 2, 16, "#9b6bff");
    }
  }

  jump() {
    if (this.onGround && !this.dead) {
      this.vy = -JUMP_V;
      this.onGround = false;
      audio.jump();
    }
  }

  spawnParticles(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: 0.6 + Math.random() * 0.5,
        max: 1,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  frame = (now: number) => {
    if (!this.running) return;
    if (this.paused) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05; // clamp
    this.time += dt;
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  // resolve the live rect of a moving platform/shade
  liveRect(p: Platform): Rect {
    return { x: p.x + (p._ox || 0), y: p.y + (p._oy || 0), w: p.w, h: p.h };
  }

  update(dt: number) {
    const lvl = this.level;

    // fire any time-of-day narration that has come due
    this.fireScheduled();

    // update moving platforms / shades
    for (const p of [...lvl.platforms, ...lvl.movingShade]) {
      if (p.move) {
        const range = p.move.max - p.move.min;
        const phase = (p.move.phase || 0) * Math.PI * 2;
        const t = this.time * (p.move.speed / Math.max(range, 1)) + phase;
        const pos = p.move.min + (Math.sin(t) * 0.5 + 0.5) * range;
        if (p.move.axis === "x") p._ox = pos - p.x;
        else p._oy = pos - p.y;
      }
    }

    if (this.dead) {
      this.ashTimer -= dt;
      this.updateParticles(dt);
      if (this.ashTimer <= 0) {
        this.cb.onDeath();
        this.running = false;
      }
      return;
    }

    // ---- input ----
    const left = this.keys["ArrowLeft"] || this.keys["KeyA"];
    const right = this.keys["ArrowRight"] || this.keys["KeyD"];
    let move = 0;
    if (left) move -= 1;
    if (right) move += 1;
    this.vx = move * MOVE;
    if (move !== 0) {
      this.facing = move;
      this.walkAnim += dt * 10;
    } else {
      this.walkAnim = 0;
    }

    // gravity
    this.vy += GRAVITY * dt;
    if (this.vy > 1200) this.vy = 1200;

    // ---- solid platforms (including built bridge + closed gate) ----
    const solids: Rect[] = [];
    for (const p of lvl.platforms) solids.push(this.liveRect(p));
    for (const b of this.bridgeBuilt) solids.push(b);
    if (lvl.gate && !this.gateOpen) solids.push(lvl.gate);

    // conveyor carry: find platform standing on
    let conveyorPush = 0;

    // horizontal move + resolve
    this.px += this.vx * dt;
    for (const s of solids) {
      const pr = { x: this.px, y: this.py, w: PLAYER_W, h: PLAYER_H };
      if (rectsOverlap(pr, s)) {
        if (this.vx > 0) this.px = s.x - PLAYER_W;
        else if (this.vx < 0) this.px = s.x + s.w;
      }
    }

    // vertical move + resolve
    this.py += this.vy * dt;
    this.onGround = false;
    for (const p of lvl.platforms) {
      const s = this.liveRect(p);
      const pr = { x: this.px, y: this.py, w: PLAYER_W, h: PLAYER_H };
      if (rectsOverlap(pr, s)) {
        if (this.vy > 0) {
          this.py = s.y - PLAYER_H;
          this.vy = 0;
          this.onGround = true;
          if (p.conveyor) conveyorPush = p.conveyor;
        } else if (this.vy < 0) {
          this.py = s.y + s.h;
          this.vy = 0;
        }
      }
    }
    for (const s of [...this.bridgeBuilt, ...(lvl.gate && !this.gateOpen ? [lvl.gate] : [])]) {
      const pr = { x: this.px, y: this.py, w: PLAYER_W, h: PLAYER_H };
      if (rectsOverlap(pr, s)) {
        if (this.vy > 0) {
          this.py = s.y - PLAYER_H;
          this.vy = 0;
          this.onGround = true;
        } else if (this.vy < 0) {
          this.py = s.y + s.h;
          this.vy = 0;
        }
      }
    }
    // apply conveyor
    if (conveyorPush) this.px += conveyorPush * dt;

    // jump (edge handled via setKey + jump())
    if ((this.keys["ArrowUp"] || this.keys["KeyW"] || this.keys["Space"]) && this.onGround) {
      this.jump();
    }

    // ---- bounce pads ----
    for (const bp of lvl.bouncePads) {
      const pr = { x: this.px, y: this.py, w: PLAYER_W, h: PLAYER_H };
      if (rectsOverlap(pr, bp) && this.vy >= 0) {
        this.vy = -bp.power;
        this.py = bp.y - PLAYER_H;
        audio.bounce();
        this.spawnParticles(this.px + PLAYER_W / 2, bp.y, 10, "#ffb13d");
      }
    }

    // ---- world bounds / fall ----
    if (this.px < 0) this.px = 0;
    if (this.px + PLAYER_W > lvl.worldW) this.px = lvl.worldW - PLAYER_W;
    if (this.py > lvl.worldH + 80) {
      this.respawnPlayer();
    }

    // ---- sequence puzzle (bridges) ----
    if (lvl.puzzle === "sequence" && lvl.seqPads) {
      for (const pad of lvl.seqPads) {
        const pr = { x: this.px, y: this.py + PLAYER_H - 6, w: PLAYER_W, h: 8 };
        const standing = rectsOverlap(pr, pad) && this.onGround;
        if (standing && !pad.active && pad.order === this.seqProgress) {
          pad.active = true;
          audio.note(pad.note);
          this.seqProgress++;
          this.buildBridgeSegment(this.seqProgress);
          this.spawnParticles(pad.x + pad.w / 2, pad.y, 12, pad.color);
          // chromesthesia: the note blooms into a wash of its own color
          this.ripples.push({
            x: pad.x + pad.w / 2,
            y: pad.y + pad.h / 2,
            r: 8,
            max: 260,
            life: 1.1,
            ttl: 1.1,
            color: pad.color,
          });
        } else if (standing && !pad.active && pad.order > this.seqProgress) {
          // stepped out of order — reset
          audio.error();
          this.resetSequence();
        }
      }
    }

    // ---- levers puzzle ----
    if (lvl.puzzle === "levers" && lvl.levers) {
      for (const lv of lvl.levers) {
        const pr = { x: this.px, y: this.py, w: PLAYER_W, h: PLAYER_H };
        const touchTop = this.vy < -1 && rectsOverlap(pr, { ...lv, y: lv.y - 4, h: 8 });
        const headHit = rectsOverlap({ x: this.px, y: this.py - 4, w: PLAYER_W, h: 6 }, lv);
        if ((touchTop || headHit) && !lv._cool) {
          lv._cool = true as any;
          this.leverState[lv.id] = !this.leverState[lv.id];
          audio.collectToken();
          this.checkLevers();
        }
        // cooldown release when not touching
        if (!rectsOverlap(pr, { ...lv, y: lv.y - 8, h: lv.h + 12 }) && (lv as any)._cool) {
          (lv as any)._cool = false;
        }
      }
    }

    // ---- shade & energy ----
    this.inShade = this.computeShade();
    const warmth = this.computeWarmth();
    if (lvl.theme.drain > 0) {
      if (this.shieldActive) {
        // immune; gentle regen
        this.energy = Math.min(MAX_ENERGY, this.energy + 8 * dt);
      } else if (this.inShade) {
        this.energy = Math.min(MAX_ENERGY, this.energy + 26 * dt);
      } else {
        this.energy -= 14 * lvl.theme.drain * dt;
      }
      if (this.energy <= 0) {
        this.energy = 0;
        this.die();
      }

      // critical-energy NOX quip (one-shot; rearms once you recover)
      if (this.energy < 22 && !this.criticalFired) {
        this.criticalFired = true;
        this.cb.onDialogue(["NOX: You look extra crispy."], "nox");
      } else if (this.energy > 60 && this.criticalFired) {
        this.criticalFired = false;
      }

      // daydream / low-energy hallucination
      this.daydreamCooldown -= dt;
      if (this.daydreamTimer > 0) {
        this.daydreamTimer -= dt;
      } else if (this.energy < 20 && this.daydreamCooldown <= 0) {
        this.daydreamTimer = 3.5 + Math.random() * 1.5;
        this.daydreamCooldown = 11;
      }
    }

    // shield timer
    if (this.shieldActive) {
      this.shieldTimer -= dt;
      if (Math.random() < 0.5) {
        this.spawnParticles(
          this.px + PLAYER_W / 2 + (Math.random() - 0.5) * 40,
          this.py + PLAYER_H / 2 + (Math.random() - 0.5) * 40,
          1,
          "#b48bff",
        );
      }
      if (this.shieldTimer <= 0) this.shieldActive = false;
    }

    // ---- collectibles ----
    for (const c of lvl.collectibles) {
      if (this.collected.has(c.id)) continue;
      const pr = { x: this.px, y: this.py, w: PLAYER_W, h: PLAYER_H };
      if (rectsOverlap(pr, c)) {
        this.collected.add(c.id);
        if (c.kind === "memory") {
          this.globalStats.memoryFound++;
          this.collectedMemories.push({ id: c.id, label: c.label || "A Solstice Memory", desc: c.desc || "" });
          audio.collectMoon();
          this.spawnParticles(c.x + c.w / 2, c.y + c.h / 2, 12, "#ffe9b0");
          if (c.label) this.cb.onDialogue([`Memory found: ${c.label}.`, c.desc || ""].filter(Boolean), "nox");
        } else if (c.kind === "token") {
          this.shields++;
          this.globalStats.tokensFound++;
          audio.collectToken();
          this.spawnParticles(c.x + c.w / 2, c.y + c.h / 2, 10, "#9b6bff");
        } else if (c.kind === "note") {
          this.globalStats.notesFound++;
          audio.collectSticker();
          this.spawnParticles(c.x + c.w / 2, c.y + c.h / 2, 14, "#7fd1c4");
          const n = this.globalStats.notesFound;
          const tot = this.globalStats.notesTotal;
          this.cb.onDialogue(
            this.allNotesFound()
              ? ["NOX: That's the last Encrypted Note!", "NOX: Something just unlocked. I can feel it."]
              : [`NOX: An Encrypted Note. Strange symbols... (${n}/${tot})`],
            "nox",
          );
        } else {
          // postcard
          this.globalStats.postcardsFound++;
          this.collectedPostcards.push({
            id: c.id,
            label: c.label || "A Postcard",
            desc: c.desc || "A postcard from your coffin.",
          });
          audio.collectSticker();
          this.spawnParticles(c.x + c.w / 2, c.y + c.h / 2, 14, "#ffd36b");
          this.cb.onDialogue([c.desc || "A postcard from your coffin."], "nox");
        }
      }
    }

    // ---- checkpoints ----
    for (const cp of lvl.checkpoints) {
      const pr = { x: this.px, y: this.py, w: PLAYER_W, h: PLAYER_H };
      if (!cp.reached && rectsOverlap(pr, cp)) {
        cp.reached = true;
        this.respawn = { x: cp.x - 10, y: cp.y - 10 };
        this.energy = MAX_ENERGY;
        audio.checkpoint();
        this.spawnParticles(cp.x, cp.y, 14, "#7fd1c4");
      }
    }

    // ---- dialogue triggers ----
    for (const d of lvl.dialogue) {
      if (!d.fired && Math.abs(this.px - d.x) < 40) {
        d.fired = true;
        this.cb.onDialogue(d.lines);
      }
    }

    // ---- npc dialogue (final level) ----
    if (lvl.npcs) {
      for (const n of lvl.npcs) {
        if (!(n as any)._fired && Math.abs(this.px - n.x) < 50) {
          (n as any)._fired = true;
          this.cb.onDialogue([n.line]);
        }
      }
    }

    // ---- goal ----
    const pr = { x: this.px, y: this.py, w: PLAYER_W, h: PLAYER_H };
    if (rectsOverlap(pr, lvl.goal)) {
      const gateBlocking = lvl.gate && !this.gateOpen && lvl.puzzle === "levers";
      if (!gateBlocking) {
        this.completeLevel();
        return;
      }
    }

    // camera
    this.camX = Math.max(0, Math.min(this.px + PLAYER_W / 2 - VIEW_W / 2, lvl.worldW - VIEW_W));
    this.camY = Math.max(0, Math.min(this.py - VIEW_H / 2, lvl.worldH - VIEW_H));
    if (lvl.worldH <= VIEW_H) this.camY = lvl.worldH - VIEW_H;

    this.updateParticles(dt);
    this.emitHud(warmth);
  }

  buildBridgeSegment(count: number) {
    // build planks across the gap as the sequence advances
    const startX = 760;
    const endX = 1840;
    const segs = 6;
    const segW = (endX - startX) / segs;
    this.bridgeBuilt = [];
    for (let i = 0; i < count && i < segs; i++) {
      this.bridgeBuilt.push({
        x: startX + i * segW,
        y: 500,
        w: segW + 2,
        h: 18,
      });
    }
  }

  resetSequence() {
    this.seqProgress = 0;
    this.bridgeBuilt = [];
    if (this.level.seqPads) for (const p of this.level.seqPads) p.active = false;
  }

  checkLevers() {
    const sol = this.leverWant;
    const match = sol.length > 0 && sol.every((v, i) => v === this.leverState[i]);
    if (match && !this.gateOpen) {
      this.gateOpen = true;
      audio.gate();
      if (this.level.gate) this.spawnParticles(this.level.gate.x, this.level.gate.y + 100, 20, "#7fd1c4");
    } else if (!match && this.gateOpen) {
      this.gateOpen = false;
    }
  }

  computeShade(): boolean {
    const cx = this.px + PLAYER_W / 2;
    const cy = this.py + PLAYER_H / 2;
    // static shade zones
    for (const z of this.level.shade) {
      if (cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h) return true;
    }
    // moving shade casts a column downward
    for (const m of this.level.movingShade) {
      const r = this.liveRect(m);
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y) return true;
    }
    // bridges cast shade beneath
    for (const b of this.bridgeBuilt) {
      if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + 120) return true;
    }
    return false;
  }

  computeWarmth(): number {
    // progress through the whole game maps to warmth of light
    const stage = this.level.theme.sunStage; // 1..6
    const base = Math.min(1, (stage - 1) / 5);
    return base;
  }

  updateParticles(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    // chromesthesia ripples expand and fade
    for (const r of this.ripples) {
      r.life -= dt;
      r.r = r.max * (1 - r.life / r.ttl);
    }
    this.ripples = this.ripples.filter((r) => r.life > 0);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.ashTimer = 1.6;
    audio.ash();
    this.spawnParticles(this.px + PLAYER_W / 2, this.py + PLAYER_H / 2, 26, "#8a8f99");
    const deathLines = [
      "NOX: ...and he turns to ash. Classic.",
      "NOX: A pile of dust. Very dramatic. 10/10.",
      "NOX: The sun wins this round. Let's try again.",
      "NOX: Note to self: shade good, sun bad.",
      "NOX: You ARE a vampire, you know how this works!",
    ];
    this.cb.onDialogue([deathLines[Math.floor(Math.random() * deathLines.length)]]);
  }

  respawnPlayer() {
    this.px = this.respawn.x;
    this.py = this.respawn.y;
    this.vx = 0;
    this.vy = 0;
    this.energy = MAX_ENERGY;
  }

  completeLevel() {
    audio.win();
    this.running = false;
    const idx = this.levelIndex;
    if (idx >= LEVELS.length - 1) {
      this.cb.onEnding();
    } else {
      this.cb.onLevelComplete(idx);
    }
  }

  emitHud(warmth: number) {
    const cs = this.level.collectibles;
    const count = (k: Collectible["kind"], onlyCollected = false) =>
      cs.filter((c) => c.kind === k && (!onlyCollected || this.collected.has(c.id))).length;
    const lvlStats: Stats = {
      memoryTotal: count("memory"),
      memoryFound: count("memory", true),
      tokensFound: count("token", true),
      postcardsTotal: count("postcard"),
      postcardsFound: count("postcard", true),
      notesTotal: count("note"),
      notesFound: count("note", true),
    };
    this.cb.onHud({
      energy: this.energy,
      shields: this.shields,
      shieldActive: this.shieldActive,
      shieldTime: this.shieldTimer,
      inShade: this.inShade,
      sunStage: this.level.theme.sunStage,
      levelName: this.level.theme.name,
      levelSubtitle: this.level.theme.subtitle,
      hint: this.level.hint || "",
      stats: lvlStats,
      globalStats: { ...this.globalStats },
      warmth,
    });
  }

  // ------------------------------ RENDER ------------------------------
  render() {
    const ctx = this.ctx;
    const lvl = this.level;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.save();
    // sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, lvl.theme.skyTop);
    g.addColorStop(1, lvl.theme.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // sun in sky based on stage
    this.drawSun(ctx, lvl, W, H);

    // parallax hills
    this.drawHills(ctx, lvl, W, H);

    // distant home (coffin) — the emotional goal, drawn closer each level
    this.drawDistantHome(ctx, lvl, W, H);

    // level-specific backdrop decoration
    if (lvl.theme.music === "sushi") this.drawSushiBackdrop(ctx, lvl, W, H);
    else if (lvl.id === 2) this.drawBeachBackdrop(ctx, lvl, W, H);

    // National Flip-Flop Day garland strung across the top of the beach
    if (lvl.id === 2) this.drawFlipFlopBunting(ctx, W, H);

    ctx.translate(-this.camX, -this.camY);

    // dynamic shadows: solids cast a slanted shadow that lengthens with the day
    this.drawDynamicShadows(ctx, lvl);

    // shade zones (drawn as soft canopies)
    for (const z of lvl.shade) this.drawShade(ctx, z);

    // platforms
    for (const p of lvl.platforms) this.drawPlatform(ctx, this.liveRect(p), p);

    // bridge
    for (let i = 0; i < this.bridgeBuilt.length; i++) {
      const b = this.bridgeBuilt[i];
      const colors = ["#ff5d5d", "#ffb13d", "#ffe14d", "#54d96a", "#4fa3ff", "#9b6bff"];
      ctx.fillStyle = colors[i % colors.length];
      this.roundRect(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.fill();
    }

    // gate
    if (lvl.gate) {
      ctx.save();
      ctx.globalAlpha = this.gateOpen ? 0.15 : 1;
      ctx.fillStyle = "#5a6b6a";
      this.roundRect(ctx, lvl.gate.x, lvl.gate.y, lvl.gate.w, lvl.gate.h, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      for (let yy = lvl.gate.y + 10; yy < lvl.gate.y + lvl.gate.h; yy += 24) {
        ctx.fillRect(lvl.gate.x, yy, lvl.gate.w, 3);
      }
      ctx.restore();
    }

    // cipher plaque — the carved pattern the levers must match (reshuffled each play)
    if (lvl.puzzle === "levers" && lvl.levers && this.leverWant.length) {
      this.drawCipherPlaque(ctx, lvl);
    }

    // seq pads
    if (lvl.seqPads) {
      for (const pad of lvl.seqPads) {
        // pulse a glowing ring around the next pad to step, to guide the player
        if (!pad.active && pad.order === this.seqProgress) {
          const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
          ctx.save();
          ctx.globalAlpha = 0.35 + pulse * 0.45;
          ctx.strokeStyle = pad.color;
          ctx.lineWidth = 3;
          this.roundRect(ctx, pad.x - 5, pad.y - 5, pad.w + 10, pad.h + 10, 9);
          ctx.stroke();
          ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = pad.active ? 1 : 0.55;
        ctx.fillStyle = pad.color;
        this.roundRect(ctx, pad.x, pad.y, pad.w, pad.h, 6);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "bold 14px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(String(pad.order + 1), pad.x + pad.w / 2, pad.y + 16);
        ctx.restore();
      }
    }

    // levers
    if (lvl.levers) {
      for (const lv of lvl.levers) {
        const on = this.leverState[lv.id];
        ctx.fillStyle = "#3a3f33";
        this.roundRect(ctx, lv.x + 6, lv.y + 30, lv.w - 12, lv.h - 30, 4);
        ctx.fill();
        ctx.save();
        ctx.translate(lv.x + lv.w / 2, lv.y + 30);
        ctx.rotate(on ? -0.5 : 0.5);
        ctx.fillStyle = on ? "#7fd1c4" : "#b85c5c";
        this.roundRect(ctx, -5, -28, 10, 30, 4);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -28, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.font = "16px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(this.leverSymbols[lv.id] ?? lv.symbol, lv.x + lv.w / 2, lv.y + 22);
      }
    }

    // bounce pads
    for (const bp of lvl.bouncePads) this.drawFlipFlop(ctx, bp);

    // checkpoints
    for (const cp of lvl.checkpoints) this.drawCheckpoint(ctx, cp);

    // npcs
    if (lvl.npcs) for (const n of lvl.npcs) this.drawNpc(ctx, n);

    // collectibles
    for (const c of lvl.collectibles) {
      if (this.collected.has(c.id)) continue;
      this.drawCollectible(ctx, c);
    }

    // moving shade objects (trays/clouds) drawn above
    for (const m of lvl.movingShade) this.drawMovingShade(ctx, this.liveRect(m), m);

    // pride parade flair — bunting + drifting confetti over the parade route
    if (lvl.id === 3) this.drawParade(ctx, W, H);

    // goal (coffin / door)
    this.drawGoal(ctx, lvl.goal);

    // chromesthesia ripples (rings of audible color)
    if (this.ripples.length) {
      ctx.save();
      for (const rp of this.ripples) {
        ctx.globalAlpha = Math.max(0, (rp.life / rp.ttl) * 0.5);
        ctx.strokeStyle = rp.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // player
    this.drawPlayer(ctx);

    ctx.restore();

    // sun overlay tint as warmth increases / out-of-shade vignette
    this.drawLightOverlay(ctx, lvl, W, H);

    // low-energy daydream haze on top of everything
    if (this.daydreamTimer > 0) this.drawDaydream(ctx, W, H);
  }

  /** Solids throw a soft, slanted shadow whose length grows toward sunset. */
  drawDynamicShadows(ctx: CanvasRenderingContext2D, lvl: Level) {
    const t = (lvl.theme.sunStage - 1) / 5; // 0 morning .. 1 sunset
    // shadow leans away from the sun and stretches as the day wears on
    const lean = (t - 0.5) * 2; // -1 (morning, left) .. +1 (evening, right)
    const len = 10 + t * 46;
    ctx.save();
    ctx.fillStyle = "rgba(20,16,40,0.16)";
    for (const p of lvl.platforms) {
      const r = this.liveRect(p);
      if (r.w < 24) continue;
      const dx = lean * len;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y + r.h);
      ctx.lineTo(r.x + r.w, r.y + r.h);
      ctx.lineTo(r.x + r.w + dx, r.y + r.h + len);
      ctx.lineTo(r.x + dx, r.y + r.h + len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** A brief, gentle hallucination when the vampire is running on fumes. */
  drawDaydream(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const fade = Math.min(1, this.daydreamTimer, 0.6);
    ctx.save();
    // warm wobble haze
    ctx.globalAlpha = 0.18 * fade;
    const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, "rgba(255,225,160,0)");
    g.addColorStop(1, "rgba(120,80,160,0.9)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // drifting daydream glyphs (a cozy coffin, little moons)
    ctx.globalAlpha = 0.5 * fade;
    ctx.fillStyle = "#fff2c8";
    ctx.font = "26px system-ui";
    ctx.textAlign = "center";
    for (let i = 0; i < 4; i++) {
      const dx = (Math.sin(this.time * 1.3 + i * 1.7) * 0.5 + 0.5) * W;
      const dy = ((this.time * 22 + i * 90) % (H + 60)) - 30;
      ctx.fillText(i % 2 === 0 ? "☾" : "★", dx, dy);
    }
    // a daydreamy thought, kept light
    ctx.globalAlpha = 0.8 * fade;
    ctx.fillStyle = "rgba(20,12,30,0.7)";
    this.roundRect(ctx, W / 2 - 170, 60, 340, 40, 14);
    ctx.fill();
    ctx.globalAlpha = fade;
    ctx.fillStyle = "#ffe9b8";
    ctx.font = "italic 15px system-ui";
    ctx.fillText("...mmm, a cool dark coffin and a nice long nap...", W / 2, 85);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawSun(ctx: CanvasRenderingContext2D, lvl: Level, W: number, H: number) {
    const stage = lvl.theme.sunStage; // 1..6
    const t = (stage - 1) / 5;
    const sx = W * (0.12 + t * 0.76);
    const sy = H * (0.5 - Math.sin(t * Math.PI) * 0.38) + 40;
    const r = 46;
    ctx.save();
    const grd = ctx.createRadialGradient(sx, sy, 4, sx, sy, r * 2.6);
    const warm = stage >= 5;
    grd.addColorStop(0, warm ? "rgba(255,210,140,0.95)" : "rgba(255,250,220,0.95)");
    grd.addColorStop(0.4, warm ? "rgba(255,160,90,0.5)" : "rgba(255,240,180,0.5)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = warm ? "#ffb45c" : "#fff6cf";
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Pride parade flair: rainbow bunting strung across the top + drifting confetti. */
  drawParade(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const time = performance.now() * 0.001;
    const colors = ["#ff5d5d", "#ffb13d", "#ffe14d", "#54d96a", "#4fa3ff", "#9b6bff"];
    ctx.save();
    // bunting string
    const span = 64;
    const off = ((this.camX * 0.25) % span + span) % span;
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = -span; x <= W + span; x += 8) {
      const yy = 8 + Math.sin((x + off) * 0.03) * 5;
      if (x === -span) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    // triangular pennants
    let i = 0;
    for (let x = -span - off; x <= W + span; x += span) {
      const yTop = 8 + Math.sin((x + off) * 0.03) * 5;
      const wob = Math.sin(time * 2 + i) * 3;
      ctx.fillStyle = colors[((i % colors.length) + colors.length) % colors.length];
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x + span, yTop);
      ctx.lineTo(x + span / 2 + wob, yTop + 26);
      ctx.closePath();
      ctx.fill();
      i++;
    }
    ctx.globalAlpha = 1;
    // drifting confetti
    for (let k = 0; k < 48; k++) {
      const speed = 28 + (k % 6) * 14;
      const baseX = (k * 137.5) % W;
      const sway = Math.sin(time * 1.4 + k) * 14;
      const cx = ((baseX + sway) % W + W) % W;
      const cy = ((time * speed + k * 53) % (H + 40)) - 20;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 3 + k);
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = colors[k % colors.length];
      ctx.fillRect(-3, -3, 6, 5);
      ctx.restore();
    }
    ctx.restore();
  }

  /** Beach atmosphere for National Flip-Flop Day: clouds, gulls, a sailboat, sea glitter. */
  drawBeachBackdrop(ctx: CanvasRenderingContext2D, _lvl: Level, W: number, H: number) {
    const t = this.time;
    ctx.save();
    // drifting fluffy clouds (slow parallax)
    const wrap = W + 240;
    const cloudOff = ((this.camX * 0.08) % wrap + wrap) % wrap;
    for (let i = 0; i < 3; i++) {
      const cxp = ((i * (W / 2 + 130) - cloudOff) % wrap + wrap) % wrap - 120;
      const cyp = H * (0.16 + i * 0.07) + Math.sin(t * 0.5 + i) * 6;
      ctx.globalAlpha = 0.85;
      this.drawCloud(ctx, cxp, cyp, 150, 34);
    }
    // a little sailboat drifting along the horizon
    const horizon = H - 116;
    const bx = ((t * 10) % (W + 200)) - 100 - this.camX * 0.04;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#3a2f56";
    ctx.beginPath();
    ctx.moveTo(bx - 16, horizon - 26);
    ctx.lineTo(bx + 16, horizon - 26);
    ctx.lineTo(bx + 10, horizon - 18);
    ctx.lineTo(bx - 10, horizon - 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.moveTo(bx, horizon - 56);
    ctx.lineTo(bx, horizon - 28);
    ctx.lineTo(bx + 16, horizon - 28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ff9a3d";
    ctx.beginPath();
    ctx.moveTo(bx - 2, horizon - 54);
    ctx.lineTo(bx - 2, horizon - 30);
    ctx.lineTo(bx - 16, horizon - 30);
    ctx.closePath();
    ctx.fill();
    // seagulls gliding (simple V wings)
    ctx.strokeStyle = "rgba(60,50,80,0.7)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const gx = ((t * 18 + i * 220) % (W + 120)) - 60;
      const gy = H * 0.2 + Math.sin(t * 0.8 + i * 2) * 16 + i * 12;
      const wob = Math.sin(t * 4 + i) * 3;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(gx - 9, gy + wob);
      ctx.quadraticCurveTo(gx, gy - 5, gx + 1, gy);
      ctx.quadraticCurveTo(gx + 2, gy - 5, gx + 11, gy + wob);
      ctx.stroke();
    }
    // sun glitter sparkles
    for (let k = 0; k < 14; k++) {
      const sxp = ((k * 97.3 + Math.sin(t * 0.6 + k) * 30) % W + W) % W;
      const syp = H * (0.42 + (k % 5) * 0.02);
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + k));
      ctx.globalAlpha = tw * 0.5;
      ctx.fillStyle = "rgba(255,250,210,0.9)";
      ctx.fillRect(sxp, syp, 2, 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Festive garland of tiny flip-flops strung across the top of the beach. */
  drawFlipFlopBunting(ctx: CanvasRenderingContext2D, W: number, _H: number) {
    const t = this.time;
    const colors = ["#ff7ac0", "#4fd0c4", "#ffe14d", "#ff9a3d", "#9b6bff", "#4fa3ff"];
    ctx.save();
    const span = 70;
    const off = ((this.camX * 0.2) % span + span) % span;
    // the string the flip-flops hang from
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = -span; x <= W + span; x += 8) {
      const yy = 6 + Math.sin((x + off) * 0.025) * 6;
      if (x === -span) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    // hanging mini flip-flops
    let i = 0;
    for (let x = -span - off; x <= W + span; x += span) {
      const topY = 6 + Math.sin((x + off) * 0.025) * 6;
      const sway = Math.sin(t * 2 + i) * 0.18;
      const c = colors[((i % colors.length) + colors.length) % colors.length];
      ctx.save();
      ctx.translate(x + span / 2, topY);
      ctx.rotate(sway);
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 12);
      ctx.stroke();
      ctx.fillStyle = c;
      this.roundRect(ctx, -9, 12, 18, 26, 9);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 20);
      ctx.lineTo(-5, 34);
      ctx.moveTo(0, 20);
      ctx.lineTo(5, 34);
      ctx.stroke();
      ctx.restore();
      i++;
    }
    ctx.restore();
  }

  /** Carved cipher plaque above the levers showing the (randomized) target pattern. */
  drawCipherPlaque(ctx: CanvasRenderingContext2D, lvl: Level) {
    const levers = lvl.levers!;
    const n = levers.length;
    const cell = 60;
    const padX = 14;
    const w = n * cell + padX * 2;
    const h = 92;
    const cxCenter = levers.reduce((s, l) => s + l.x + l.w / 2, 0) / n;
    const x = cxCenter - w / 2;
    const y = (lvl.gate ? lvl.gate.y : 240) + 36;
    const order = this.leverPlaqueOrder.length ? this.leverPlaqueOrder : levers.map((_, idx) => idx);
    ctx.save();
    // stone tablet
    ctx.fillStyle = "rgba(40,52,50,0.92)";
    this.roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(127,209,196,0.55)";
    ctx.lineWidth = 2;
    this.roundRect(ctx, x, y, w, h, 10);
    ctx.stroke();
    ctx.fillStyle = "rgba(199,240,232,0.9)";
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("MATCH THE RUNES", x + w / 2, y + 18);
    for (let k = 0; k < n; k++) {
      const li = order[k];
      const cellX = x + padX + k * cell + cell / 2;
      const on = this.leverWant[li];
      ctx.fillStyle = on ? "#ffe6a3" : "rgba(170,180,178,0.5)";
      ctx.font = "22px system-ui";
      ctx.fillText(this.leverSymbols[li] ?? levers[li].symbol, cellX, y + 50);
      ctx.beginPath();
      ctx.arc(cellX, y + 66, 6, 0, Math.PI * 2);
      ctx.fillStyle = on ? "#7fd1c4" : "#3a3f3d";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(220,235,232,0.75)";
      ctx.font = "8px system-ui";
      ctx.fillText(on ? "ON" : "OFF", cellX, y + 84);
    }
    ctx.restore();
  }

  drawHills(ctx: CanvasRenderingContext2D, lvl: Level, W: number, H: number) {
    ctx.save();
    const off = this.camX * 0.3;
    ctx.fillStyle = this.shade(lvl.theme.ground, 1.15);
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = -200; x <= W + 200; x += 80) {
      const y = H - 120 - Math.sin((x + off) * 0.01) * 50;
      ctx.lineTo(x - (off % 80), y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // The vampire's coffin home, far in the background, getting closer each level.
  drawDistantHome(ctx: CanvasRenderingContext2D, lvl: Level, W: number, H: number) {
    const t = (lvl.theme.sunStage - 1) / 5; // 0 (start of day, home far) .. 1 (almost home)
    const scale = 0.6 + t * 1.15;
    const hx = W * (0.74 - t * 0.1) - this.camX * 0.05;
    const horizon = H - 116;
    const groundY = horizon + 4;
    ctx.save();
    ctx.globalAlpha = 0.55 + t * 0.4;

    // soft hill mound the home rests on
    ctx.fillStyle = this.shade(lvl.theme.skyBottom, 0.88);
    ctx.beginPath();
    ctx.ellipse(hx, groundY, 100 * scale, 30 * scale, 0, Math.PI, 0);
    ctx.fill();

    // coffin silhouette (six-sided), standing upright
    const cw = 30 * scale;
    const ch = 54 * scale;
    const cx = hx;
    const topY = groundY - ch;
    const pts: [number, number][] = [
      [cx - cw * 0.3, topY],
      [cx + cw * 0.3, topY],
      [cx + cw * 0.5, topY + ch * 0.24],
      [cx + cw * 0.34, groundY],
      [cx - cw * 0.34, groundY],
      [cx - cw * 0.5, topY + ch * 0.24],
    ];

    // warm glow halo behind the home (stronger as we near it)
    ctx.save();
    ctx.shadowColor = "rgba(255,196,120,0.7)";
    ctx.shadowBlur = (16 + t * 18) + Math.sin(this.time * 2) * 5;
    ctx.fillStyle = "#241c3a";
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // coffin body
    ctx.fillStyle = "#3a2f56";
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // warm window — home's light, gently flickering
    const wy = topY + ch * 0.44;
    const flick = 0.72 + Math.sin(this.time * 4 + t) * 0.14;
    ctx.fillStyle = `rgba(255,205,130,${flick})`;
    ctx.beginPath();
    ctx.arc(cx, wy, 5 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Sushi-level backdrop: giant koi drifting in the distance (NOX's "giant fish").
  drawSushiBackdrop(ctx: CanvasRenderingContext2D, _lvl: Level, W: number, H: number) {
    ctx.save();
    const off = this.camX * 0.14;
    const fx = W * 0.52 - off * 0.3;
    const fy = H * 0.32 + Math.sin(this.time * 0.7) * 10;
    ctx.globalAlpha = 0.16;
    this.drawBigFish(ctx, fx, fy, 1.7, "#ff8a5c");
    ctx.globalAlpha = 0.1;
    this.drawBigFish(ctx, fx + 280 - off * 0.2, fy + 130 + Math.sin(this.time * 0.55 + 2) * 9, 1.1, "#ff5d7a");
    ctx.restore();
  }

  drawBigFish(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
    ctx.save();
    ctx.fillStyle = color;
    // body
    ctx.beginPath();
    ctx.ellipse(x, y, 70 * s, 30 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // tail
    ctx.beginPath();
    ctx.moveTo(x + 58 * s, y);
    ctx.lineTo(x + 100 * s, y - 26 * s);
    ctx.lineTo(x + 100 * s, y + 26 * s);
    ctx.closePath();
    ctx.fill();
    // dorsal fin
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, y - 26 * s);
    ctx.lineTo(x + 20 * s, y - 50 * s);
    ctx.lineTo(x + 28 * s, y - 24 * s);
    ctx.closePath();
    ctx.fill();
    // eye (faces left)
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(x - 44 * s, y - 6 * s, 6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(x - 45 * s, y - 6 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // A single piece of nigiri sushi: rice base + fish slice. type 0 salmon, 1 tuna, 2 tamago.
  drawNigiri(ctx: CanvasRenderingContext2D, x: number, yBase: number, scale: number, type: number) {
    const w = 22 * scale;
    const rh = 9 * scale;
    ctx.save();
    // rice
    ctx.fillStyle = "#fdf6ec";
    this.roundRect(ctx, x, yBase - rh, w, rh, 4);
    ctx.fill();
    // fish slice draped over the rice
    let fc = "#ff9a6b";
    if (type === 1) fc = "#e0564f";
    else if (type === 2) fc = "#f4d35e";
    ctx.fillStyle = fc;
    this.roundRect(ctx, x - 1, yBase - rh - 6 * scale, w + 2, 7 * scale, 4);
    ctx.fill();
    if (type === 0) {
      // salmon stripes
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.lineWidth = 1.4;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + (w / 4) * i - 4, yBase - rh - 6 * scale + 1);
        ctx.lineTo(x + (w / 4) * i, yBase - rh - 1);
        ctx.stroke();
      }
    } else if (type === 2) {
      // nori band around tamago
      ctx.fillStyle = "#2a2a3a";
      ctx.fillRect(x + w / 2 - 3 * scale, yBase - rh - 6 * scale, 6 * scale, rh + 6 * scale);
    }
    ctx.restore();
  }

  drawShade(ctx: CanvasRenderingContext2D, z: Rect & { style?: string }) {
    ctx.save();
    // soft shadow on ground
    ctx.fillStyle = "rgba(40,30,70,0.16)";
    this.roundRect(ctx, z.x, z.y, z.w, z.h, 14);
    ctx.fill();
    const cx = z.x + z.w / 2;
    if (z.style === "umbrella") {
      ctx.fillStyle = "#9b6b4a";
      ctx.fillRect(cx - 3, z.y + 20, 6, z.h - 20);
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.moveTo(z.x, z.y + 40);
      ctx.quadraticCurveTo(cx, z.y - 30, z.x + z.w, z.y + 40);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      for (let i = 0; i < z.w; i += 28) {
        ctx.beginPath();
        ctx.moveTo(z.x + i, z.y + 38);
        ctx.lineTo(z.x + i + 14, z.y + 38);
        ctx.lineTo(z.x + i + 7, z.y + 48);
        ctx.closePath();
        ctx.fill();
      }
    } else if (z.style === "tree") {
      ctx.fillStyle = "#7a5230";
      ctx.fillRect(cx - 8, z.y + z.h - 120, 16, 120);
      ctx.fillStyle = "#3f9d5a";
      ctx.beginPath();
      ctx.arc(cx, z.y + 60, z.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4fbf6e";
      ctx.beginPath();
      ctx.arc(cx - 28, z.y + 80, z.w / 3, 0, Math.PI * 2);
      ctx.arc(cx + 28, z.y + 80, z.w / 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (z.style === "tent") {
      ctx.fillStyle = "#e85c5c";
      ctx.beginPath();
      ctx.moveTo(z.x, z.y + z.h);
      ctx.lineTo(cx, z.y);
      ctx.lineTo(z.x + z.w, z.y + z.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(cx, z.y);
      ctx.lineTo(z.x + z.w * 0.62, z.y + z.h);
      ctx.lineTo(z.x + z.w * 0.38, z.y + z.h);
      ctx.closePath();
      ctx.fill();
    } else if (z.style === "cloud") {
      this.drawCloud(ctx, z.x, z.y, z.w, z.h);
    } else {
      // building / awning
      ctx.fillStyle = z.style === "awning" ? "#6a4f8a" : "#5d6470";
      this.roundRect(ctx, z.x, z.y, z.w, z.h, 8);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      for (let yy = z.y + 20; yy < z.y + z.h - 20; yy += 50) {
        for (let xx = z.x + 18; xx < z.x + z.w - 24; xx += 46) {
          ctx.fillRect(xx, yy, 26, 30);
        }
      }
    }
    ctx.restore();
  }

  drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    const r = h * 0.9;
    ctx.beginPath();
    ctx.arc(x + r, y + h / 2, r, 0, Math.PI * 2);
    ctx.arc(x + w * 0.5, y + h / 2 - 6, r * 1.2, 0, Math.PI * 2);
    ctx.arc(x + w - r, y + h / 2, r, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPlatform(ctx: CanvasRenderingContext2D, r: Rect, p: Platform) {
    const lvl = this.level;
    if (p.style === "ground") {
      ctx.fillStyle = lvl.theme.ground;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = this.shade(lvl.theme.ground, 1.25);
      ctx.fillRect(r.x, r.y, r.w, 8);
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      for (let x = r.x; x < r.x + r.w; x += 44) ctx.fillRect(x, r.y + 8, 2, r.h - 8);
    } else if (p.style === "wood") {
      ctx.fillStyle = p.conveyor ? "#8a5a3a" : "#a06a3a";
      this.roundRect(ctx, r.x, r.y, r.w, r.h, 4);
      ctx.fill();
      if (p.conveyor) {
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        const dir = Math.sign(p.conveyor);
        const off = (this.time * 60 * dir) % 30;
        for (let x = r.x - 30 + off; x < r.x + r.w; x += 30) {
          ctx.beginPath();
          ctx.moveTo(x, r.y + 6);
          ctx.lineTo(x + 12 * dir, r.y + r.h / 2);
          ctx.lineTo(x, r.y + r.h - 6);
          ctx.closePath();
          ctx.fill();
        }
        // sushi plates riding along the belt
        const spacing = 86;
        const slide = this.time * Math.abs(p.conveyor) * dir;
        const phase = ((slide % spacing) + spacing) % spacing;
        for (let x = r.x + phase - spacing; x < r.x + r.w - 24; x += spacing) {
          if (x < r.x + 2) continue;
          const idx = Math.abs(Math.round(x / spacing)) % 3;
          this.drawNigiri(ctx, x, r.y, 0.85, idx);
        }
      }
    } else if (p.style === "stone") {
      ctx.fillStyle = "#8d9384";
      this.roundRect(ctx, r.x, r.y, r.w, r.h, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(r.x, r.y + r.h - 4, r.w, 4);
    } else {
      ctx.fillStyle = "#a06a3a";
      this.roundRect(ctx, r.x, r.y, r.w, r.h, 4);
      ctx.fill();
    }
  }

  drawMovingShade(ctx: CanvasRenderingContext2D, r: Rect, p: Platform) {
    // shadow column hint
    ctx.save();
    ctx.fillStyle = "rgba(40,30,70,0.10)";
    ctx.fillRect(r.x, r.y + r.h, r.w, this.level.worldH - (r.y + r.h));
    ctx.restore();
    if (p.style === "cloud") {
      this.drawCloud(ctx, r.x, r.y, r.w, r.h + 10);
      return;
    }
    // tray
    ctx.fillStyle = "#caa05a";
    this.roundRect(ctx, r.x, r.y, r.w, r.h, 6);
    ctx.fill();
    ctx.fillStyle = this.shade("#caa05a", 0.82);
    ctx.fillRect(r.x, r.y + r.h - 4, r.w, 4);
    // a plate of nigiri served on the tray
    this.drawNigiri(ctx, r.x + 14, r.y, 0.95, 0);
    this.drawNigiri(ctx, r.x + 44, r.y, 0.95, 1);
    this.drawNigiri(ctx, r.x + 74, r.y, 0.95, 2);
  }

  drawFlipFlop(ctx: CanvasRenderingContext2D, bp: Rect) {
    ctx.save();
    const palette = [
      { sole: "#ff7ac0", strap: "#ffe14d" },
      { sole: "#4fd0c4", strap: "#ff7ac0" },
      { sole: "#ffb13d", strap: "#4fa3ff" },
      { sole: "#9b6bff", strap: "#ffe14d" },
    ];
    const c = palette[Math.abs(Math.round(bp.x / 100)) % palette.length];
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4 + bp.x);
    const bob = Math.sin(this.time * 4 + bp.x) * 2;
    const x = bp.x;
    const y = bp.y + bob;
    const w = bp.w;
    const h = bp.h;
    const cx = x + w / 2;
    const r = h / 2;

    // soft ground shadow
    ctx.fillStyle = "rgba(40,30,70,0.18)";
    ctx.beginPath();
    ctx.ellipse(cx, bp.y + h + 7, w * 0.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // springy launch glow
    ctx.save();
    ctx.globalAlpha = 0.22 + pulse * 0.32;
    ctx.shadowColor = c.sole;
    ctx.shadowBlur = 14;
    ctx.fillStyle = c.sole;
    this.roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.restore();

    // sole (footbed)
    ctx.fillStyle = c.sole;
    this.roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.fillStyle = this.shade(c.sole, 1.2);
    this.roundRect(ctx, x + 5, y + 4, w - 10, h - 8, (h - 8) / 2);
    ctx.fill();

    // Y-strap: toe-post near the front, two thongs flaring to the heel
    const postX = x + w * 0.74;
    const postY = y + h / 2;
    ctx.strokeStyle = c.strap;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(postX, postY);
    ctx.lineTo(x + w * 0.3, y + 7);
    ctx.moveTo(postX, postY);
    ctx.lineTo(x + w * 0.3, y + h - 7);
    ctx.stroke();
    ctx.fillStyle = c.strap;
    ctx.beginPath();
    ctx.arc(postX, postY, 4, 0, Math.PI * 2);
    ctx.fill();

    // a little sparkle when the catapult is most charged
    if (pulse > 0.85) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("★", cx, y - 6);
    }
    ctx.restore();
  }

  drawCheckpoint(ctx: CanvasRenderingContext2D, cp: Rect & { reached?: boolean }) {
    ctx.save();
    ctx.fillStyle = "#5a4a3a";
    ctx.fillRect(cp.x + cp.w / 2 - 3, cp.y, 6, cp.h);
    const flagColor = cp.reached ? "#7fd1c4" : "#cfd3da";
    ctx.fillStyle = flagColor;
    const flap = Math.sin(this.time * 6) * 4;
    ctx.beginPath();
    ctx.moveTo(cp.x + cp.w / 2 + 3, cp.y + 4);
    ctx.lineTo(cp.x + cp.w / 2 + 30, cp.y + 12 + flap);
    ctx.lineTo(cp.x + cp.w / 2 + 3, cp.y + 22);
    ctx.closePath();
    ctx.fill();
    if (cp.reached) {
      ctx.fillStyle = "#1a1430";
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("☾", cp.x + cp.w / 2 + 14, cp.y + 16 + flap);
    }
    ctx.restore();
  }

  drawNpc(ctx: CanvasRenderingContext2D, n: Rect & { who: string }) {
    ctx.save();
    const bob = Math.sin(this.time * 2 + n.x) * 2;
    ctx.fillStyle = "#3a2a4a";
    ctx.beginPath();
    ctx.ellipse(n.x + n.w / 2, n.y + n.h, n.w / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const colors = ["#ff9a3d", "#4fa3ff", "#ff4fa3", "#7fd1c4"];
    ctx.fillStyle = colors[Math.abs(Math.round(n.x)) % colors.length];
    this.roundRect(ctx, n.x, n.y + bob, n.w, n.h, 10);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(n.x + n.w * 0.35, n.y + 18 + bob, 3, 0, Math.PI * 2);
    ctx.arc(n.x + n.w * 0.65, n.y + 18 + bob, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCollectible(ctx: CanvasRenderingContext2D, c: Collectible) {
    const bob = Math.sin(this.time * 3 + c.x) * 4;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2 + bob;
    ctx.save();
    if (c.kind === "memory") {
      // a glowing Solstice Memory — a warm summer-light orb with a soft star
      const r = c.w / 2;
      ctx.shadowColor = "rgba(255,210,120,0.95)";
      ctx.shadowBlur = 18;
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
      g.addColorStop(0, "#fff6dc");
      g.addColorStop(1, "#ffce6b");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "13px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★", cx, cy + 1);
    } else if (c.kind === "note") {
      // an Encrypted Note — a teal slip with cipher marks
      ctx.shadowColor = "rgba(127,209,196,0.85)";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#e9fff9";
      this.roundRect(ctx, c.x, cy - c.h / 2, c.w, c.h, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#2f8f7f";
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const ly = cy - c.h / 2 + 7 + i * 6;
        ctx.beginPath();
        ctx.moveTo(c.x + 4, ly);
        ctx.lineTo(c.x + c.w - 4, ly);
        ctx.stroke();
      }
    } else if (c.kind === "token") {
      ctx.shadowColor = "rgba(155,107,255,0.9)";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#9b6bff";
      ctx.beginPath();
      ctx.arc(cx, cy, c.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // tiny bat
      ctx.fillStyle = "#2a1a4a";
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx - 10, cy - 6, cx - 12, cy + 2);
      ctx.quadraticCurveTo(cx - 6, cy, cx, cy + 2);
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + 10, cy - 6, cx + 12, cy + 2);
      ctx.quadraticCurveTo(cx + 6, cy, cx, cy + 2);
      ctx.fill();
    } else {
      // postcard — a little envelope from the coffin
      ctx.shadowColor = "rgba(255,211,107,0.9)";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#ffe9b8";
      this.roundRect(ctx, c.x, cy - c.h / 2, c.w, c.h, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#b8893a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(c.x, cy - c.h / 2);
      ctx.lineTo(cx, cy + 1);
      ctx.lineTo(c.x + c.w, cy - c.h / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGoal(ctx: CanvasRenderingContext2D, g: Rect) {
    ctx.save();
    // coffin
    ctx.fillStyle = "#3a2a1a";
    this.roundRect(ctx, g.x, g.y, g.w, g.h, 6);
    ctx.fill();
    ctx.fillStyle = "#5a4030";
    this.roundRect(ctx, g.x + 6, g.y + 6, g.w - 12, g.h - 12, 4);
    ctx.fill();
    ctx.strokeStyle = "#caa05a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.x + g.w / 2, g.y + 14);
    ctx.lineTo(g.x + g.w / 2, g.y + g.h - 14);
    ctx.moveTo(g.x + g.w * 0.3, g.y + 26);
    ctx.lineTo(g.x + g.w * 0.7, g.y + 26);
    ctx.stroke();
    // glow
    ctx.shadowColor = "rgba(180,130,255,0.7)";
    ctx.shadowBlur = 16 + Math.sin(this.time * 3) * 6;
    ctx.strokeStyle = "rgba(180,130,255,0.5)";
    ctx.lineWidth = 2;
    this.roundRect(ctx, g.x, g.y, g.w, g.h, 6);
    ctx.stroke();
    ctx.restore();
  }

  drawPlayer(ctx: CanvasRenderingContext2D) {
    const x = this.px;
    const y = this.py;
    ctx.save();
    if (this.dead) {
      // ash pile
      const a = Math.max(0, this.ashTimer / 1.6);
      ctx.globalAlpha = a;
      ctx.fillStyle = "#9aa0ab";
      ctx.beginPath();
      ctx.ellipse(x + PLAYER_W / 2, y + PLAYER_H, PLAYER_W / 2 + 4, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    // shadow
    ctx.fillStyle = "rgba(20,10,40,0.2)";
    ctx.beginPath();
    ctx.ellipse(x + PLAYER_W / 2, y + PLAYER_H + 2, PLAYER_W / 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // shield aura
    if (this.shieldActive) {
      ctx.strokeStyle = "rgba(155,107,255,0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + PLAYER_W / 2, y + PLAYER_H / 2, 30 + Math.sin(this.time * 10) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    const f = this.facing;
    const cx = x + PLAYER_W / 2;
    const legSwing = this.onGround ? Math.sin(this.walkAnim) * 4 : 2;

    // cape
    ctx.fillStyle = "#5a1030";
    ctx.beginPath();
    ctx.moveTo(cx - f * 8, y + 8);
    ctx.quadraticCurveTo(cx - f * 22, y + 22, cx - f * 10, y + PLAYER_H);
    ctx.lineTo(cx, y + PLAYER_H);
    ctx.closePath();
    ctx.fill();

    // body
    ctx.fillStyle = "#1c1430";
    this.roundRect(ctx, x + 4, y + 12, PLAYER_W - 8, PLAYER_H - 14, 5);
    ctx.fill();
    // legs
    ctx.fillStyle = "#120c22";
    ctx.fillRect(cx - 7, y + PLAYER_H - 6 + legSwing, 5, 6);
    ctx.fillRect(cx + 2, y + PLAYER_H - 6 - legSwing, 5, 6);

    // head
    ctx.fillStyle = "#f3e7d8";
    ctx.beginPath();
    ctx.arc(cx, y + 9, 9, 0, Math.PI * 2);
    ctx.fill();
    // hair
    ctx.fillStyle = "#1c1430";
    ctx.beginPath();
    ctx.arc(cx, y + 6, 9, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 9, y + 6);
    ctx.lineTo(cx - 6, y + 12);
    ctx.lineTo(cx - 3, y + 6);
    ctx.lineTo(cx, y + 12);
    ctx.lineTo(cx + 3, y + 6);
    ctx.lineTo(cx + 6, y + 12);
    ctx.lineTo(cx + 9, y + 6);
    ctx.closePath();
    ctx.fill();
    // eyes
    ctx.fillStyle = "#c0303a";
    ctx.beginPath();
    ctx.arc(cx + f * 2 - 3, y + 9, 1.6, 0, Math.PI * 2);
    ctx.arc(cx + f * 2 + 3, y + 9, 1.6, 0, Math.PI * 2);
    ctx.fill();
    // collar
    ctx.fillStyle = "#5a1030";
    ctx.beginPath();
    ctx.moveTo(cx - 6, y + 16);
    ctx.lineTo(cx, y + 22);
    ctx.lineTo(cx + 6, y + 16);
    ctx.fill();

    ctx.restore();

    // NOX the bat fluttering near the player
    this.drawNox(ctx, x, y);
  }

  drawNox(ctx: CanvasRenderingContext2D, px: number, py: number) {
    const t = this.time;
    const bx = px - this.facing * 30 + Math.sin(t * 2) * 6;
    const by = py - 18 + Math.sin(t * 5) * 6;
    const flap = Math.sin(t * 14) * 6;
    ctx.save();
    ctx.fillStyle = "#2a1a4a";
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fill();
    // ears
    ctx.beginPath();
    ctx.moveTo(bx - 3, by - 5);
    ctx.lineTo(bx - 5, by - 11);
    ctx.lineTo(bx - 1, by - 6);
    ctx.moveTo(bx + 3, by - 5);
    ctx.lineTo(bx + 5, by - 11);
    ctx.lineTo(bx + 1, by - 6);
    ctx.fill();
    // wings
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx - 14, by - 6 + flap, bx - 18, by + 4 + flap);
    ctx.quadraticCurveTo(bx - 9, by + 2, bx, by + 3);
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + 14, by - 6 - flap, bx + 18, by + 4 - flap);
    ctx.quadraticCurveTo(bx + 9, by + 2, bx, by + 3);
    ctx.fill();
    // eyes
    ctx.fillStyle = "#ffe14d";
    ctx.beginPath();
    ctx.arc(bx - 2, by - 1, 1.4, 0, Math.PI * 2);
    ctx.arc(bx + 2, by - 1, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawLightOverlay(ctx: CanvasRenderingContext2D, lvl: Level, W: number, H: number) {
    // warm tint based on time of day
    const warmth = this.computeWarmth();
    if (warmth > 0.01) {
      ctx.save();
      ctx.globalAlpha = warmth * 0.22;
      ctx.fillStyle = lvl.theme.sunStage >= 5 ? "#ff7a3c" : "#ffd27a";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // danger vignette when in sunlight and low energy
    if (!this.inShade && !this.shieldActive && this.energy < 45 && lvl.theme.drain > 0) {
      ctx.save();
      const a = (1 - this.energy / 45) * 0.5;
      const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      grd.addColorStop(0, "rgba(255,80,40,0)");
      grd.addColorStop(1, `rgba(255,60,30,${a})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // helpers
  roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  shade(hex: string, factor: number) {
    // darken/lighten a hex color
    const c = hex.replace("#", "");
    const n = parseInt(c.length === 3 ? c.split("").map((s) => s + s).join("") : c, 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r / factor)));
    g = Math.max(0, Math.min(255, Math.round(g / factor)));
    b = Math.max(0, Math.min(255, Math.round(b / factor)));
    return `rgb(${r},${g},${b})`;
  }
}

export { VIEW_W, VIEW_H, LEVELS };
