# Status — Arena Duel

## Implemented

- Vertical 9:16 dark-fantasy arena layout (centered stage, letterboxed on wider screens).
- Pixel-art knight + orc sprite sheets (idle/attack/hurt/death), sliced & animated via `SpriteSheet`.
- Top bar: victories + gold + shop button.
- HP bars (green player / red enemy) with smooth width transitions; blue stamina bar under player HP.
- Three action buttons (Attack / Shield / Focus) with stamina costs and disable-when-out logic.
- Full turn-based flow with hidden random enemy intent; shield/focus/crit/blocked mechanics.
- Combat effects: floating damage/crit/blocked/heal/stamina text, burst sparks, screen shake,
  hurt/death animations, guard badge, focus glow.
- Victory loot popup (+gold, +victory, "Next Duel" scaling orc HP) and defeat popup (revive).
- Shop modal (weapon/armor upgrades with level-scaled costs).
- Persistent save via `localStorage` (gold, victories, weapon/armor levels).
- Retro 8-bit/16-bit SFX (slash/hit/block/focus/crit/victory/click) with ±5% pitch variation on
  combat hits, plus a looping dark-arena ambient track; mute toggle in the top header.
- Live tuning panel wired (`DebugPanel.define`) with combat / progression / ui / advanced groups.
- Localization file (`src/locales/en.json`) for all player-visible text.

## Next steps / possible improvements

- More enemy variety and a difficulty ramp beyond HP scaling.
- Weapon/armor visual variation on the knight sprite.

## Legacy

- Phaser scaffold (`GameComponent`, `Game.ts`, `MainScene.ts`) is unused and kept for reference only.
