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
- Shop modal with two tabs — **Upgrades** (level-based weapon/armor) and **Armory** (gear
  inventory): weapon/armor/relic slots with BUY / EQUIP / EQUIPPED states.
- Equipment & gear system — **"Zero to Hero" progression**: 4 weapon tiers (Wooden Club → Rusty
  Dagger → Iron Short Sword → Flaming Longsword) and 4 armor tiers (Ragged Clothes → Leather Tunic →
  Iron Chainmail → Full Knight Armor) plus 3 relics. The player starts as a Tier-0 peasant (80 HP,
  10–15 base damage) with a rags-and-club sprite, swapping to the armored knight + tier aura as gear
  is equipped. Gear unlocks/equips persist in `localStorage`.
- Persistent save via `localStorage` (gold, victories, weapon/armor levels, owned + equipped gear,
  shards).
- Enemy rotation: Goblin Rogue (25% dodge) → Orc Berserker → Skeleton Warlock (2-turn poison DoT),
  cycling by victory count, with a **Minotaur Warlord boss every 5th duel** (2× HP, BOSS tag,
  red aura, 1-turn-telegraphed Heavy Slam, 3× gold + guaranteed Relic Shard, ominous intro).
- Enemy name shown above the HP bar; boss entrance plays an intro sting + red flash + screen shake.
- Retro 8-bit/16-bit SFX (slash/hit/block/focus/crit/victory/click) with ±5% pitch variation on
  combat hits, plus a looping dark-arena ambient track; mute toggle in the top header.
- Live tuning panel wired (`DebugPanel.define`) with combat / progression / ui / advanced groups.
- Localization file (`src/locales/en.json`) for all player-visible text.

## Next steps / possible improvements

- More enemy variety and a difficulty ramp beyond HP scaling.
- Weapon/armor visual variation on the knight sprite.

## Legacy

- Phaser scaffold (`GameComponent`, `Game.ts`, `MainScene.ts`) is unused and kept for reference only.
