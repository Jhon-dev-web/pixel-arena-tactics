# Requirements — Arena Duel

## Combat rules (implemented)

- Turn order: player acts first (with animation/effects), then the enemy acts. Enemy intent is hidden
  and rolled randomly each turn (50% attack / 25% shield / 25% focus).
- Player actions:
  - **Attack** (15 stamina): 22–30 damage + weapon bonus; guaranteed crit (2×) when Focus buff active.
  - **Shield** (25 stamina): reduces incoming damage by 70% that turn.
  - **Focus** (0 stamina): +40 stamina, +12 HP, primes next attack for crit.
- No passive stamina regen; Attack/Shield buttons disable when stamina is too low.
- Enemy actions: Attack / Shield (reduces player damage 70%) / Focus (heals HP).
- Victory (enemy HP 0) → death animation + shake + loot popup (+35–65 gold, +1 victory).
- Defeat (player HP 0) → death animation + defeat popup (revive, same round, keep gold/victories).
- Next duel scales orc HP by +15% per round (`enemyBaseHp * (1 + 0.15*(round-1))`).

## Progression & shop

- **Upgrades tab**: weapon upgrade +5 attack/level (cost = level × 50 gold); armor upgrade +20 max
  HP/level (cost = level × 50 gold, also heals the gained amount).
- **Armory tab (gear)**: 3 slots — weapon, armor, relic.
  - Weapon: Iron Longsword (+5 dmg, default) → Steel Broadsword (+15 dmg, +5% crit, 150g) →
    Dragon Flameblade (+30 dmg, burn 5/turn, 400g).
  - Armor: Soldier Cuirass (+20 HP, default) → Knight's Plate (+50 HP, +5% resist, 150g) →
    Aegis Titan Armor (+100 HP, shield reflects 20%, 400g).
  - Relic: Ring of Vitality (Focus +15 HP, 200g), Amulet of Swiftness (attack stamina 15→10, 250g),
    Berserker Crest (crit 2.5×, 350g).
- Owned gear can be equipped; owned + equipped gear persist in `localStorage`. Higher-tier weapons
  add a glow to the knight sprite; the burn DoT shows a glow on the enemy.
- Gold, victories, upgrade levels, and gear unlock/equip state persist in `localStorage`.

## Coding patterns

- Read every gameplay/UI constant from the `DebugPanel.define` schema (`T`) at the point of use —
  never inline new numeric literals, px, hex, or ms values.
- Turn resolution stays a pure function; the component owns animation timing.
- All display text comes from `src/locales/en.json` with `{n}` placeholders.
- Sprite animation is the `SpriteSheet` component; never hand-edit `background-position` elsewhere.

## Known issues / constraints

- The pixel-art sprite sheets are generated assets; frame alignment inside each 4x4 cell is
  approximate (fine at small display sizes with `image-rendering: pixelated`).
- The background image is 4:5 and is cropped (`background-size: cover`) to the 9:16 stage.
- `phaser` / `@agent8/gameserver` / `lucide-react` / `tailwindcss` remain in `package.json` but are
  unused by the current game.
