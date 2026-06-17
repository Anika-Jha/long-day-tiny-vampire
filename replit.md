# Long Day, Tiny Vampire

A wholesome browser game where a tiny vampire races the June Solstice — the longest day of the year — managing sunlight/shade energy across six festival levels with his bat companion NOX.

## Run & Operate

- The game is a frontend-only React + Vite artifact at `artifacts/tiny-vampire` (slug `tiny-vampire`, served at `/`).
- Run via the workflow `artifacts/tiny-vampire: web` (do not run `pnpm dev` at the repo root).
- `pnpm --filter @workspace/tiny-vampire run typecheck` — typecheck the game.
- The pre-existing `api-server` and `mockup-sandbox` artifacts are scaffold/tooling; the game does not use them (no backend, DB, or API needed).

## Stack

- React 18 + Vite + TypeScript, Tailwind v4, path alias `@/` → `src/`.
- Rendering: a single HTML `<canvas>` driven by a `requestAnimationFrame` game loop.
- Audio: procedural Web Audio (no audio files) — music and SFX are synthesized.

## Where things live (game)

- `src/game/types.ts` — shared level/entity types.
- `src/game/levels.ts` — the 6 level definitions (`LEVELS`) + `SUN_STAGES`. Source of truth for all level geometry, shade, collectibles, and puzzles.
- `src/game/engine.ts` — `GameEngine` class: physics, shade/energy, puzzles, camera, and all canvas rendering. Exports `VIEW_W` (960) / `VIEW_H` (540).
- `src/game/audio.ts` — `audio` singleton (procedural music per level + SFX).
- `src/components/Game.tsx` — React layer: canvas mount, keyboard input, HUD overlay, all screens (title/death/levelComplete/ending/credits/pause).
- `src/App.tsx` — mounts `<Game />`.

## Architecture decisions

- One shared platformer engine expresses every level's distinct mechanic via data (conveyor belts, moving shade, bounce pads, sequence pads + rainbow bridge, cipher levers + gate, scarce shade, narrative NPCs) rather than separate engines.
- Core loop: out of shade drains energy (scaled by `theme.drain`); shade regenerates; bat shields grant ~5s sun immunity. Energy 0 → ash → respawn at last checkpoint.
- The engine owns mutable game state; React only renders HUD/screens from `onHud` callbacks and forwards input. The engine instance is created once and reused across runs.

## User preferences

- No emojis in source files; the canvas uses text-glyph game art (☾, ★, ←/→) and an SVG bat instead.

## Gotchas

- Level data objects in `levels.ts` are mutated at runtime (checkpoint `reached`, dialogue `fired`, seq pad `active`, lever `_cool`/`on`, npc `_fired`, gate `open`). `GameEngine.loadLevel()` MUST reset all of these every load, or replays/retries soft-lock (e.g. the Level 3 rainbow bridge cannot rebuild). A fresh run also resets `shields` + collected set in `startGame()`.
- Level 4's cipher puzzle is RANDOMIZED per play, not fixed: `loadLevel()` reshuffles `leverSymbols` (rune glyphs), `leverWant` (target ON/OFF pattern, guaranteed ≥1 ON), and `leverPlaqueOrder` (display order). `checkLevers()` validates against `this.leverWant` (NOT the now-unused `leverSolution` in `levels.ts`). The solution is communicated to the player only by the on-canvas "MATCH THE RUNES" plaque (`drawCipherPlaque`), which derives its display from the same shuffle — so plaque and levers always correspond. These three fields are part of the loadLevel reset contract above; failing to reset them breaks replays.
- The narrative/immersion systems add per-load engine state that `loadLevel()` must ALSO reset, or replays misbehave: `scheduled[]` (timed Sun/NOX lines), `ripples[]` (chromesthesia), `daydreamTimer`/`daydreamCooldown` (low-energy daydream), and `criticalFired` (the one-shot "crispy" critical-energy line, re-armed when energy climbs back above ~60). `collectedMemories`/postcard/note found-counts accumulate across the run and reset only in `startGame()`.
- Game flow starts on the `"intro"` screen (the skippable canvas cinematic in `Cinematic.tsx`, ~35s) → `"title"` → gameplay. The cinematic is a self-contained fullscreen rAF canvas rendered OUTSIDE the scaled VIEW_W/VIEW_H wrapper; it guards `onDone` with a ref so skip (click/key/timeout) fires exactly once.
- Because `Game.tsx` early-returns the cinematic when `screen === "intro"`, the main `<canvas>` is NOT mounted during intro. The `GameEngine` is therefore created via a CALLBACK ref (`mountCanvas`), not a one-time `useEffect`. A `useEffect` keyed on stable deps would run while the canvas is unmounted (ref null), never create the engine, and `start()` no-ops → blank screen on fresh load (HMR masks this). Same reason the scale-fitting effect depends on `screen` so it recomputes once the wrapper mounts.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
