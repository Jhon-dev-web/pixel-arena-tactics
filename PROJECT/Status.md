# Status — Arena Duel

## Implemented

- Vertical 9:16 dark-fantasy arena layout (centered stage, letterboxed on wider screens).
- **AFK RPG mobile layout** (Legend of Mushroom style): compact top HUD (avatar, editable hero name
  + ✏️, `Lv. N`, thin XP bar, ⚡ CP, gold/shards, ⚙️/🔊), an uncluttered centered hero training at the
  dummy, a prominent `[⚔️ ENTER DUNGEON]` button, and a fixed 4-tab bottom nav (Base / Forge / Shop /
  Attributes). Modals open as bounded pop-ups with an `[X]` close button.
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
- Equipment & gear system — **"Zero to Hero" progression**: 5 weapon tiers (Wooden Club → Bronze
  Dagger → Iron Short Sword → Steel Greatsword → Dragon Flameblade) and 5 armor tiers (Ragged Clothes
  → Bronze-studded Leather → Iron Chainmail → Full Steel Plate → Dragon Scale Armor) plus 3 relics,
  each tagged with a forge material (Wood/Bronze/Iron/Steel/Dragon Scales/Cloth). The player starts
  as a Tier-0 peasant (80 HP, 10–15 base damage). Gear unlocks/equips persist in `localStorage`.
- **Distinct sprite per armor tier** (0–4: peasant / bronze / iron / steel-knight / dragon), swapped
  instantly in both the arena and the base when armor is equipped.
- **AFK base (camp) scene** (Legend of Mushroom style): the hero trains in a looping idle animation
  and passively accrues gold + XP per second; XP levels up (each level grants +5 max HP).
  `[⚔️ Enter Dungeon]` / `[🏕️ Return to Camp]` switch scenes.
- **Admin / cheat panel** (`⚙️` button or `F2`): +10,000 gold, +50 shards, unlock all weapons/armors,
  God Mode / One-Hit Kill toggle, Reset Save (in-page, no reload). Changes persist to `localStorage`.
- **Shop (consumables) vs Forge (crafting) split**: `[🛒 Shop]` sells HP/stamina potions, the
  Strength Elixir (+20% damage next duel), and forge-material packs (Iron/Steel/Leather/Essence).
  `[⚒️ Forge]` is a blacksmith-themed modal that crafts weapons/armors/relics (gold + materials),
  with FORGE / EQUIP / EQUIPPED states.
- **Attributes, name & CP**: editable hero name, level + XP bar, and ⚡ Combat Power shown in the
  camp; an Attributes modal distributes 3 points/level across STR (damage + AFK), VIT (max HP),
  AGI (dodge), RES (damage resist). All persisted.
- **AFK scaling**: gold/XP per-second scales with level and STR (`1 + ⌊lvl*0.4⌋ + ⌊STR*0.1⌋` gold,
  `2 + ⌊lvl*0.5⌋ + ⌊STR*0.15⌋` XP). Level is capped at **Lv 100** (`MAX` display + frozen XP) with an
  exponential XP curve (`100 × 1.15^(lvl-1)`); bugged saves beyond the cap reset to Lv 1 / 0 XP.
  The HUD shows compact big-number suffixes (1.5K / 1.2M) for gold, shards, and CP.
- **Equipped weapon visual**: a separate weapon sprite layer (Club/Bronze Gladius/Iron Sword/Steel
  Greatsword/Dragon Blade) overlaid on the character in the arena (one-shot swing) and camp (training
  loop), blade facing the target and layered in front; camp training shows impact sparks + floating
  damage numbers.
- **Dungeon escape rule**: returning to camp mid-fight abandons the duel (no gold/shards); entering
  the dungeon restarts from the last conquered duel without resetting total victories.
- Persistent save via `localStorage` (gold, victories, shards, xp, hero name, attributes, materials,
  potions, weapon/armor levels, owned + equipped gear).
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
- Offline (closed-app) AFK accumulation using timestamps.
- Use relic shards to buy relics.

## Legacy

- Phaser scaffold (`GameComponent`, `Game.ts`, `MainScene.ts`) is unused and kept for reference only.
