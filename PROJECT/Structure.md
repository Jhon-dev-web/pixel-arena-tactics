# Structure — Arena Duel

## `src/main.tsx`

Entry point. Mounts `<App />` into `#root` with React 18 `createRoot` under `StrictMode`.

## `src/App.tsx`

Root component and the whole game UI. Holds combat state (player/enemy fighters, phase, animations,
floating text, bursts), the turn orchestrator `doTurn`, and renders the top bar, arena, controls,
shop modal, and victory/defeat popups. Uses refs to mirror state for the async turn flow.

## `src/App.css`

All game styling and keyframes (sprite container, HP/stamina bars, action buttons, modals, floating
damage text, burst sparks, screen shake, guard/focus effects). UI sizes are driven by CSS custom
properties (`--sprite-size`, `--bar-w`, `--bar-h`, `--action-h`, `--action-gap`, `--font-size`)
whose defaults match the tunable schema and whose `var()` fallbacks are the published defaults.

## `src/index.css`

Tailwind directives (kept; unused by the game UI).

## `src/locales/en.json`

All player-visible text (UI labels, combat float labels, modal strings) with `{n}` placeholders.

## `src/assets.json`

Asset manifest:
- `spritesheets.knight` / `spritesheets.orc` — 4x4 pixel-art sheets (idle/attack/hurt/death rows)
  with frame metadata (1024px, 256px frames).
- `background.arena` — pixel-art colosseum background (covered to fill the stage).
- `sfx.*` — one-shot 8-bit/16-bit effects: `slash`, `hit`, `block`, `focus`, `crit`, `victory`,
  `click` (OGG).
- `music.ambient` — looping dark-dungeon ambient track (60s, OGG).

## `src/components/SpriteSheet.tsx`

`<SpriteSheet>` — slices a 4x4 sheet and animates the requested row's frames via
`requestAnimationFrame` (responsive, reads `clientWidth`). Props: `src`, `size`, `row`, `frames`,
`fps`, `flip`, `playOnce`, `onDone`.

## `src/game/tunables.ts`

`DebugPanel.define` schema (`T`) + the `TUNABLES CONTRACT` comment. Groups: `combat`,
`progression`, `ui` (cssVar-bound layout), `advanced`. Exports `setTunableListener` so React can
re-render when a displayed tunable changes.

## `src/game/engine.ts`

Pure game logic: `FighterState`, `SaveData`, `CombatEvent`, `resolveTurn`, `rollEnemyAction`,
`makePlayer`, `makeEnemy`, `playerMaxHp`, `enemyHpForRound`, `loadSave`/`persistSave`/`defaultSave`.

## `src/game/audio.ts`

Web Audio sound manager. Preloads/decodes all `sfx.*` + `music.ambient` into `AudioBuffer`s on
`initAudio()`; `playSfx(key, pitchVariance)` plays a one-shot (optional ±pitch), `setMuted`/`loadMuted`
persist the mute flag and start/stop the looping ambient track, `unlockAudio` seeds the ambient loop
on first user gesture. Uses a single shared `AudioContext`.

## `index.html`

Vite HTML shell. Title "Arena Duel", `Press Start 2P` font link, `GAME_SIZE_RESPONSE` postMessage
reporting for embed hosts.

## Legacy (unused, not imported)

- `src/components/GameComponent.tsx`, `src/game/Game.ts`, `src/game/scenes/MainScene.ts` — the
  original Phaser scaffold. Left in place; not referenced by the current game.
