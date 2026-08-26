# Requirements — Arena Duel

## Combat rules (implemented)

- Turn order: player acts first (with animation/effects), then the enemy acts. Enemy intent is hidden
  and rolled randomly each turn (50% attack / 25% shield / 25% focus).
- Player actions:
  - **Attack** (15 stamina): 10–15 base damage + weapon bonus; guaranteed crit (2×) when Focus buff active.
  - **Shield** (25 stamina): reduces incoming damage by 70% that turn.
  - **Focus** (0 stamina): +40 stamina, +12 HP, primes next attack for crit.
- No passive stamina regen; Attack/Shield buttons disable when stamina is too low.
- Enemy actions: Attack / Shield (reduces player damage 70%) / Focus (heals HP).
- Victory (enemy HP 0) → death animation + shake + loot popup (+35–65 gold, +1 victory).
- Defeat (player HP 0) → death animation + defeat popup (revive, same round, keep gold/victories).
- Next duel scales orc HP by +15% per round (`enemyBaseHp * (1 + 0.15*(round-1))`).

## Enemy variety & boss

- 3 enemy types rotate by victory count: **Goblin Rogue** (0.8× HP, 25% dodge, always attacks),
  **Orc Berserker** (baseline, attacks/shields/heals), **Skeleton Warlock** (1.1× HP, casts a 2-turn
  poison DoT on hit).
- **Boss (every 5th duel)**: Minotaur Warlord (2× HP, red aura, "⚠️ BOSS" tag). Boss actions include
  a telegraphed **Heavy Slam** (charges 1 turn with a red-flash/`!` warning, then deals 40–55 damage,
  reduced 70% by Shield). Boss victory awards 3× gold + 1 Relic Shard (persistent, shown in the top
  bar and victory popup).
- Enemy name is displayed above the HP bar; boss entry plays an ominous sting, red flash, and shake.

## Progression & shop

- **Upgrades tab**: weapon upgrade +5 attack/level (cost = level × 50 gold); armor upgrade +20 max
  HP/level (cost = level × 50 gold, also heals the gained amount).
- **Armory tab (gear)** — "Zero to Hero" progression, 3 slots (weapon, armor, relic):
  - Weapon: Wooden Club (+0, default) → Rusty Dagger (+6 dmg, 40g) → Iron Short Sword
    (+15 dmg, +5% crit, 120g) → Flaming Longsword (+30 dmg, burn, 350g).
  - Armor: Ragged Clothes (+0, default, 80 HP) → Leather Tunic (+25 HP, 50g) → Iron Chainmail
    (+60 HP, +5% resist, 130g) → Full Knight Armor (+120 HP, shield reflects 20%, 350g).
  - Relic: Ring of Vitality (Focus +15 HP, 200g), Amulet of Swiftness (attack stamina 15→10, 250g),
    Berserker Crest (crit 2.5×, 350g).
- The knight sprite swaps to a rags-and-club peasant at Tier 0 and gains an aura by equipment tier
  (steel/flame for weapons, iron/gold for armor); the visual updates instantly on equip. Base HP is
  80 and base damage is 10–15.
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
