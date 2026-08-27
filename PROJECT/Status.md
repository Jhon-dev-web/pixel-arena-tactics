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
- **Base camp scene**: a clean background-only campsite (original campfire, no character/overlay).
  A single bottom action bar holds `[⚒️ Forge]` / `[⚔️ ENTER DUNGEON]` / `[🛒 Shop]`, plus an
  attributes trigger on the avatar. No passive/AFK gains — gold, XP, and shards come only from
  winning duels (XP per victory is tunable).
- **Admin / cheat panel** (`⚙️` button or `F2`): +10,000 gold, +50 shards, unlock all weapons/armors,
  God Mode / One-Hit Kill toggle, Reset Save (in-page, no reload). Changes persist to `localStorage`.
- **Shop (consumables) vs Forge (crafting) split**: `[🛒 Shop]` sells HP/stamina potions, the
  Strength Elixir (+20% damage next duel), and forge-material packs (Iron/Steel/Leather/Essence/
  Dragon Scales). `[⚒️ Forge]` is a blacksmith-themed modal with hierarchical crafting — higher-tier
  gear consumes lower-tier items + materials + shards (validated, removed from inventory, with a
  toast + sound on success).
- **Sell Materials** (`[🛒 Shop]` → "Sell Materials"): each material with stock can be sold back as a
  full stack for quick gold (per-unit `sellValue` in the materials catalog; a `+N Gold` toast confirms).
- **Consumables shop**: `[🛒 Shop]` now sells only 3 consumables (Small/Large Health Potion, Battle
  Elixir) that land in the Bag (`save.consumables`), each card showing icon/name/effect/cost + `Buy`.
  Forge-material buying and material selling were removed from the shop (materials come from the
  Dungeon/Expedition; all selling happens in the Bag now).
- **Bag limits & sell/discard**: the Bag caps at `20` slots (indicator `🎒 Space: X / 20`) with stack
  limits — materials `99x`, potions/elixirs `20x`, equipment `1` per equipment slot. Compact tabs
  (`All / Gear / Mats / Pots`) and a detail panel with `💰 Sell 1` / `💰 Sell All` (stacked items),
  a red `🗑️ Discard` (quick-confirm), and `Equip/Unequip` shown only for weapons/armor. Full-bag
  purchases are blocked with a "Bag full!"/"Stack full!" toast.
- **Inventory / bag** (`🎒` in the HUD): a slot grid with All/Equipment/Materials tabs, item details,
  and Equip/Unequip. Item ownership is now a quantity map (`inventory: id → qty`) persisted in
  `localStorage` (with migration from the old `owned` list).
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
- **Dungeon system**: `[⚔️ ENTER DUNGEON]` now opens a 4-floor map (`DungeonMapModal` —
  Goblin Forest → Orc Caverns → Undead Crypt → Minotaur's Lair) with recommended CP, drop previews,
  and progressive unlocking via `highestFloor`. Each floor launches an **auto-battle** (`BattleModal`):
  hero sprite vs. floor monster with HP bars, ~1.2s turn loop, floating damage/CRIT numbers, and
  victory (gold + materials + shards) / defeat overlays. Collecting rewards persists loot + XP and
  unlocks the next floor.
- **ATB combat (independent attack timers)**: hero and monster no longer strike in lockstep.
  The hero attacks on its own interval (base 1.2s, slightly reduced by AGI) and each monster has its
  own speed (1.5s–2.0s via `EnemyDef.atkSpeedMs`); each side lunges + flashes independently as its
  own attack-progress bar fills.
- **Auto-potion**: during a dungeon run, when hero HP drops below 35% of max, a Health Potion is
  consumed automatically (5s cooldown), restoring 35% max HP instantly with a green `+HP` float and a
  heal chime. Runs dry gracefully when the Bag has no potions; a `🧪 ×N` counter shows in the HUD.
- **Continuous Wave Combat (endless stages)**: the dungeon auto-battle now runs endless waves within
  a floor (`Stage {floor}-{n}`). Each cleared wave grants loot immediately (floating `+Gold/+materials`
  banner), heals 10% of max HP, and spawns the next wave after 1s. Monster HP/damage scale per stage
  (`+15%` HP, `+12%` damage), rewards grow `+15%` per stage, and every 5th wave is a **MINI-BOSS**
  (boosted stats + guaranteed shards/steel). A top HUD shows `🚩 Stage`, accumulated `🪙` gold and
  `🎒` item count. `[🏃 RETREAT WITH LOOT]` ends the run and banks the full haul (+victory, unlocks the
  next floor); defeat retains materials but keeps only 50% of the run's gold.
- **Auto-battle polish**: combatants lunge forward on their strike and flash red/white when hit;
  crits float as enlarged gold `💥 CRIT!` numbers (scale-in) while normal damage floats fade out.
  Hero and monster HP are separated left/right at the top, each with a thin blue attack-progress bar
  filling toward the next round, plus a `1x/2x` speed toggle.
- **Dungeon rebalance (nerf)**: monsters carry explicit per-floor `hp`/`dmg` — Goblin Rogue 45/6,
  Orc Berserker 110/18, Skeleton Warlock 240/38, Minotaur Warlord 550/75. A fresh hero with the
  wooden club clears Floor 1 in ~4 hits while surviving comfortably.
- **Expeditions (timed, background-tracked)**: the dungeon map exposes `[🏕️ Expedition]`
  (`ExpeditionModal`) with 4 durations — Quick Scout (5m), Forest Patrol (30m), Deep Cavern Run (2h,
  shard chance), Overnight Expedition (8h, 3 shards) — each with escalating gold/material rewards.
  Starting stores a `{ id, endsAt }` timestamp in the save so the timer runs even while the game is
  closed. The camp shows a `CampExpedition` card with a progress bar + `MM:SS` countdown and a
  `Cancel` (no rewards) option; on completion it flips to a blinking `🎁 Collect Rewards` button that
  opens a `ClaimModal` listing the haul and deposits it into the Bag/balance.

## Next steps / possible improvements

- More enemy variety and a difficulty ramp beyond HP scaling.
- Offline (closed-app) AFK accumulation using timestamps.

## Legacy

- Phaser scaffold (`GameComponent`, `Game.ts`, `MainScene.ts`) is unused and kept for reference only.
