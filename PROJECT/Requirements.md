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
- **Armory tab (gear)** — "Zero to Hero" progression, 3 slots (weapon, armor, relic), 5 tiers each
  with a forge material (Wood/Bronze/Iron/Steel/Dragon Scales; Cloth for rags):
  - Weapon: Wooden Club (+0, default) → Bronze Dagger (+6, 40g) → Iron Short Sword (+15, +5% crit,
    120g) → Steel Greatsword (+30, 300g) → Dragon Flameblade (+45, burn, 500g).
  - Armor: Ragged Clothes (+0, default, 80 HP) → Bronze-studded Leather (+25, 50g) → Iron Chainmail
    (+60, +5% resist, 130g) → Full Steel Plate (+120, reflects 20%, 350g) → Dragon Scale Armor
    (+200, +10% resist, 600g).
  - Relic: Ring of Vitality (Focus +15 HP, 200g), Amulet of Swiftness (attack stamina 15→10, 250g),
    Berserker Crest (crit 2.5×, 350g).
- The player sprite is one distinct sheet **per armor tier** (0–4), swapped instantly in both the
  base and the arena on equip; the Dragon Flameblade adds a flame aura. Base HP is 80 and base damage
  is 10–15.

## Base camp (AFK) & leveling

- A camp scene shows the hero training in a loop (swinging at a dummy); the player passively accrues
  gold + XP per second while resting there. XP levels the hero up (each level grants +5 max HP).
- AFK rates scale with level and STR: gold/s = `2 + lvl*0.5 + STR*0.2`, XP/s = `3 + lvl*0.8 + STR*0.3`.
- `[⚔️ Enter Dungeon]` → arena; `[🏕️ Return to Camp]` mid-fight abandons the duel (no rewards) and
  re-entry restarts from the last conquered duel (total victories preserved).
- Camp shows the editable hero name, level + XP bar, and ⚡ Combat Power; an Attributes modal
  distributes 3 points/level across STR (damage + AFK), VIT (max HP), AGI (dodge), RES (resist).

## Shop vs Forge

- **Shop (consumables)**: lesser health potion (40 HP), stamina potion (30 sta), strength elixir
  (+20% damage next duel), and forge-material packs (Iron Ingot / Steel Bar / Tanned Leather /
  Arcane Essence) — all bought with gold. Potions are usable in combat (free action).
- **Forge (blacksmith modal)**: crafts weapons/armors/relics (tiers 1–4) for gold + materials
  (e.g. 5× Iron Ingot + 2× Tanned Leather); FORGE activates when resources suffice, then the item
  goes to inventory to be equipped.
- The equipped weapon is drawn in-hand (club / bronze gladius / iron sword / steel greatsword /
  dragon blade) in both camp and arena.

## Admin / cheat mode

- `⚙️` button in the top bar (or `F2`) opens the admin panel: +10,000 gold, +50 relic shards, unlock
  all weapons/armors, God Mode / One-Hit Kill toggle (invulnerable + lethal hits), Reset Save
  (in-page). Changes persist to `localStorage` like normal progress.

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
