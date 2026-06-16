---
name: Canvas game level-state reset
description: Why mutable level-data objects must be reset on every level load in the tiny-vampire game engine
---

# Mutable level data must be reset on every load

**Rule:** In `artifacts/tiny-vampire`, the level definitions in `src/game/levels.ts` are plain objects that the engine mutates **in place** at runtime (checkpoint `reached`, dialogue `fired`, sequence pad `active`, lever `_cool`/`on`, npc `_fired`, gate `open`, plus moving-platform `_ox/_oy`). `GameEngine.loadLevel()` must clear ALL of these every time a level loads. A fresh run (`startGame()` in `Game.tsx`) must also reset player meta-state: `shields`, the `collected` set, and global stats.

**Why:** Because the data is shared and persistent across runs (the engine instance is created once and reused), forgetting to reset caused real progression soft-locks — most severely the Level 3 (Pride) rainbow-bridge sequence: pads stayed `active` from a prior run while `seqProgress` reset to 0, so the bridge could never rebuild. Checkpoints also stopped re-arming on retries.

**How to apply:** Any time you add a new level mechanic that writes a flag onto a level-data object (or any field prefixed `_`), add a matching reset line in `loadLevel()`. Treat "does this survive a retry / replay correctly?" as a required check for every new mechanic.
