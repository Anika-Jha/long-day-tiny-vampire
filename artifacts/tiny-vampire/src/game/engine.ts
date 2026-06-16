import type {
  Level,
  Platform,
  Rect,
  Collectible,
  Stats,
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
  onDialogue: (lines: string[]) => void;
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
    moonTotal: 0,
    moonFound: 0,
    tokensFound: 0,
    stickersFound: 0,
    secretsFound: 0,
    secretsTotal: 0,
  };

  // checkpoint
  respawn = { x: 0, y: 0 };

  // puzzle state
  seqProgress = 0;
  bridgeBuilt: Rect[] = [];
  leverState: boolean[] = [];
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
    let moon = 0;
    let secrets = 0;
    for (const lvl of LEVELS) {
      for (const c of lvl.collectibles) {
        if (c.kind === "moon") moon++;
        if (c.secret) secrets++;
      }
    }
    this.globalStats.moonTotal = moon;
    this.globalStats.secretsTotal = secrets;
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
    // intro dialogue
    const intro = this.level.dialogue.find((d) => d.id.endsWith("d0"));
    if (intro) {
      this.cb.onDialogue(intro.lines);
      intro.fired = true;
    }
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
        if (c.kind === "moon") {
          this.globalStats.moonFound++;
          audio.collectMoon();
          this.spawnParticles(c.x + c.w / 2, c.y + c.h / 2, 10, "#cfe3ff");
        } else if (c.kind === "token") {
          this.shields++;
          this.globalStats.tokensFound++;
          audio.collectToken();
          this.spawnParticles(c.x + c.w / 2, c.y + c.h / 2, 10, "#9b6bff");
        } else {
          this.globalStats.stickersFound++;
          audio.collectSticker();
          this.spawnParticles(c.x + c.w / 2, c.y + c.h / 2, 14, "#ffd36b");
        }
        if (c.secret) this.globalStats.secretsFound++;
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
        y: 470,
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
    const sol = this.level.leverSolution || [];
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
    const lvlStats: Stats = {
      moonTotal: this.level.collectibles.filter((c) => c.kind === "moon").length,
      moonFound: this.level.collectibles.filter((c) => c.kind === "moon" && this.collected.has(c.id)).length,
      tokensFound: this.level.collectibles.filter((c) => c.kind === "token" && this.collected.has(c.id)).length,
      stickersFound: this.level.collectibles.filter((c) => c.kind === "sticker" && this.collected.has(c.id)).length,
      secretsFound: this.level.collectibles.filter((c) => c.secret && this.collected.has(c.id)).length,
      secretsTotal: this.level.collectibles.filter((c) => c.secret).length,
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

    ctx.translate(-this.camX, -this.camY);

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

    // seq pads
    if (lvl.seqPads) {
      for (const pad of lvl.seqPads) {
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
        ctx.fillText(lv.symbol, lv.x + lv.w / 2, lv.y + 22);
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

    // goal (coffin / door)
    this.drawGoal(ctx, lvl.goal);

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
    ctx.fillStyle = "#ff8aa0";
    ctx.fillRect(r.x + 12, r.y - 8, 16, 10);
    ctx.fillStyle = "#fff";
    ctx.fillRect(r.x + 14, r.y - 6, 12, 4);
    ctx.fillStyle = "#7ec77e";
    ctx.beginPath();
    ctx.arc(r.x + r.w - 24, r.y - 2, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  drawFlipFlop(ctx: CanvasRenderingContext2D, bp: Rect) {
    ctx.save();
    const bob = Math.sin(this.time * 4) * 2;
    ctx.fillStyle = "#ff7ac0";
    this.roundRect(ctx, bp.x, bp.y + bob, bp.w, bp.h, 12);
    ctx.fill();
    ctx.strokeStyle = "#ffd6ec";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bp.x + bp.w * 0.5, bp.y + bob + 6);
    ctx.lineTo(bp.x + bp.w * 0.3, bp.y + bob + bp.h - 4);
    ctx.moveTo(bp.x + bp.w * 0.5, bp.y + bob + 6);
    ctx.lineTo(bp.x + bp.w * 0.7, bp.y + bob + bp.h - 4);
    ctx.stroke();
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
    if (c.kind === "moon") {
      ctx.shadowColor = "rgba(180,200,255,0.9)";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#dbe7ff";
      ctx.beginPath();
      ctx.arc(cx, cy, c.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = c.kind === "moon" ? "rgba(150,170,220,0.5)" : "#fff";
      ctx.beginPath();
      ctx.arc(cx + 4, cy - 2, c.w / 3, 0, Math.PI * 2);
      ctx.fill();
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
      // sticker
      ctx.shadowColor = "rgba(255,211,107,0.9)";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#ffd36b";
      this.roundRect(ctx, c.x, cy - c.h / 2, c.w, c.h, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#5a3a1a";
      ctx.font = "12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("★", cx, cy + 4);
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
