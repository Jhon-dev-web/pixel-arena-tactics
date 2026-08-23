# Context — Arena Duel

## Project Overview

A vertical (9:16) mobile turn-based tactical RPG arena game in pixel-art style. The player
(armored knight, facing right) duels an orc warrior (facing left) in a dark fantasy colosseum.
Each turn the player picks Attack / Shield / Focus; the enemy's intent is hidden and rolled
randomly. Victory awards gold and increments a persistent victory counter; gold is spent on
weapon/armor upgrades in a shop modal.

## Tech Stack

_Exact versions are in `package.json`._

- **UI / gameplay**: React 18 + TypeScript + CSS (no engine for the game itself)
- **Sprites**: generated pixel-art sprite sheets, sliced and animated in JS (`SpriteSheet`)
- **Styling**: plain CSS (custom properties) — Tailwind is configured but unused for the game UI
- **Persistence**: `localStorage` (gold, victories, upgrade levels)
- **Icons (unwired)**: `lucide-react`
- **Legacy (unused)**: `phaser`, `@agent8/gameserver` — the original scaffold's Phaser files remain
  in `src/game/Game.ts`, `src/game/scenes/MainScene.ts`, `src/components/GameComponent.tsx` but are
  no longer imported.

## Critical Memory

- The game is fully React + DOM/CSS. Sprites are rendered via `SpriteSheet`, which slices a 4x4
  sheet (`background-size: 400% 400%`) and drives frame columns with `requestAnimationFrame`,
  reading the element's `clientWidth` as the cell size — so it stays responsive. Row index is the
  animation: `0` idle, `1` attack, `2` hurt, `3` death.
- All gameplay/UI constants live in the `DebugPanel.define` schema in `src/game/tunables.ts`
  (see the `TUNABLES CONTRACT` comment). Game code reads `T.group.key` at the point of use.
- The orc sheet is drawn facing right and flipped with `scaleX(-1)` (`flip` prop).
- Turn resolution is a pure function (`resolveTurn` in `src/game/engine.ts`); the component
  orchestrates animations/timing with `async`/`await sleep()` and mirrors state through refs.
- Player-visible text lives in `src/locales/en.json`; no display-string literals in code.
- Assets are declared in `src/assets.json` (spritesheets + background). The background is
  `object`-style covered to fill the 9:16 stage.

## Banned words

- Neso / Meso (and Korean 네소/메소) are banned everywhere.
