import { describe, expect, it } from 'vitest';
import { buildCombatStats, computeHuntingStatus, buildHuntSession, defaultSave, normalizeSave, SaveData, xpToReachLevel } from '../engine';
import { applyBattlePassClaim, BATTLE_PASS_TRACK, BattlePassReward } from '../battlepass';
import { applyDeliveryAccept, deliveryXp, ensureDeliveryOffers } from '../deliveries';
import { applyForge, applyUpgrade } from '../gearInstances';
import { applyReforge } from '../reforge';
import { applyDiscard } from '../bagActions';
import { GEAR, getGear, isInstancedSlot, relicXpBonusPct } from '../gear';
import { HUNTING_ZONES } from '../huntingZones';
import { emptyMaterials, MATERIALS, MaterialId } from '../materials';
import { merchantBuys, merchantPrice } from '../merchant';
import { FORGE_SEAL_MIN_RARITY, RARITIES, rollRarityAtLeast, Rarity } from '../rarity';
import { playerSpriteUrl } from '../sprites';
import { applySelectSkin, applySelectFrame, applyUseStashDeed, FRAMES, STASH_BONUS_CAP, STASH_DEED_SLOTS, stashDeedBlockReason } from '../seasonItems';
import { stashCapacity, STASH_BASE_SLOTS } from '../stash';
import { usesOf } from '../itemUses';
import { EXPEDITION_TICKET_SKIP_MS, getConsumable } from '../consumables';
import { applyDeliveryTicket } from '../deliveries';
import { duel, hero, repFloor } from '../../../scripts/sim/duel';
import { mulberry32 } from '../../../scripts/sim/driver';
import { inventoryCapacity, inventorySlotsUsed } from '../inventory';
import { gearStatLines } from '../../components/gearStats';

const HOUR = 3600 * 1000;
const wire = (s: unknown): SaveData => JSON.parse(JSON.stringify(s));
const premium = (level: number): BattlePassReward => BATTLE_PASS_TRACK[level - 1].premium;
const free = (level: number): BattlePassReward => BATTLE_PASS_TRACK[level - 1].free;
const withRelic = (s: SaveData, id: string | null): SaveData => ({ ...s, inventory: id ? { ...s.inventory, [id]: Math.max(1, s.inventory[id] ?? 0) } : s.inventory, equipped: { ...s.equipped, relic: id } });
const owner = (patch: Partial<SaveData> = {}): SaveData => ({ ...defaultSave(), hasBattlePass: true, battlePassLevel: 30, passSeason: 1, ...patch });

describe('premium track integrity', () => {
  it('30 hand-authored levels, no repeating modulo pattern, every id in the catalog (catalog.test.ts), nothing repeats back to back', () => {
    expect(BATTLE_PASS_TRACK).toHaveLength(30);
    const key = (r: BattlePassReward) => `${r.kind}:${r.id ?? ''}:${r.amount}`;
    const keys = BATTLE_PASS_TRACK.map((l) => key(l.premium));
    for (let i = 1; i < keys.length; i++) expect(keys[i], `level ${i + 1}`).not.toBe(keys[i - 1]);
    // no period p < 30 such that the whole track is the same sequence shifted by p (a modulo pattern)
    for (let p = 1; p < 15; p++) expect(keys.every((k, i) => i < p || k === keys[i - p]), `period ${p}`).toBe(false);
  });

  it('no hunting materials (they would bypass the emission audit) and no gear instances; relics only the Season Relic', () => {
    const hunting = new Set<MaterialId>(HUNTING_ZONES.flatMap((z) => z.drops.map((d) => d.material)));
    expect(hunting.size).toBeGreaterThan(0);
    for (const l of BATTLE_PASS_TRACK) {
      const r = l.premium;
      for (const one of [r, ...(r.also ?? [])]) {
        if (one.kind === 'material') expect(hunting.has(one.id as MaterialId), `level ${l.level} ${one.id}`).toBe(false);
        expect(['gold', 'material', 'consumable', 'gem', 'shards', 'cosmetic', 'relic']).toContain(one.kind);
        if (one.kind === 'relic') expect(one.id).toBe('season_emblem');
        if (one.kind === 'material') expect(MATERIALS.some((m) => m.id === one.id)).toBe(true);
      }
    }
  });

  it('the exclusives sit where designed: deeds 8 / 18, seals 10 / 20 / 27, frame 15, Season Relic + title 30; the free track is untouched', () => {
    expect([premium(8), premium(18)]).toEqual([{ kind: 'consumable', id: 'stash_deed', amount: 1 }, { kind: 'consumable', id: 'stash_deed', amount: 1 }]);
    for (const l of [10, 20, 27]) expect(premium(l)).toEqual({ kind: 'consumable', id: 'forge_seal', amount: 1 });
    expect(premium(15)).toEqual({ kind: 'cosmetic', id: 'frame_season_gold', amount: 1 });
    expect(premium(30).id).toBe('season_emblem');
    expect(premium(30).also).toEqual([
      { kind: 'cosmetic', id: 'title_season_lv30', amount: 1 },
      { kind: 'cosmetic', id: 'skin_golden_knight', amount: 1 },
    ]);
    expect(free(1)).toEqual({ kind: 'gold', amount: 100 });
    expect(free(30)).toEqual({ kind: 'gold', amount: 3000 });
    expect(free(10)).toEqual({ kind: 'consumable', id: 'expedition_ticket_1h', amount: 1 });
    // Shards keep roughly today's 56
    const shards = BATTLE_PASS_TRACK.reduce((a, l) => a + (l.premium.kind === 'shards' ? l.premium.amount : 0), 0);
    expect(shards).toBe(56);
  });

  it('express tickets in the track still do something in delivery orders', () => {
    for (const id of ['expedition_ticket_2h', 'expedition_ticket_4h'] as const) {
      expect(premium(id === 'expedition_ticket_2h' ? 6 : 26).id).toBe(id);
      expect(EXPEDITION_TICKET_SKIP_MS[id]).toBeGreaterThan(0);
      expect(usesOf('consumable', id).some((u) => u.kind === 'delivery')).toBe(true);
    }
    expect(typeof applyDeliveryTicket).toBe('function');
  });

  it('claiming level 30 of the premium track gives the emblem (stackable relic) AND the exclusive title; a full bag refuses and keeps it claimable', () => {
    const s = owner();
    const r = applyBattlePassClaim(s, 30, 'premium', Date.now());
    expect(r.save!.inventory.season_emblem).toBe(1);
    expect(r.save!.cosmetics).toContain('title_season_lv30');
    expect(r.save!.claimedPassRewards.premium).toContain(30);
    // a second season's copy stacks
    const again = applyBattlePassClaim({ ...r.save!, claimedPassRewards: { free: [], premium: [] } }, 30, 'premium', Date.now());
    expect(again.save!.inventory.season_emblem).toBe(2);
    // full bag
    const full = { ...s, materials: { ...s.materials, copper: 99 * inventoryCapacity(s) } };
    const blocked = applyBattlePassClaim(full, 30, 'premium', Date.now());
    expect(blocked.save).toBeNull();
    expect(blocked.blocked).toBe(true);
    // non-owner cannot
    expect(applyBattlePassClaim({ ...s, hasBattlePass: false }, 30, 'premium', Date.now()).save).toBeNull();
  });
});

describe('Season Relic (season_emblem)', () => {
  const base = { ...defaultSave(), xp: xpToReachLevel(60) };

  it('drop-only from the track: a stackable relic, no recipe, not forgeable, not sellable to the merchant, discardable', () => {
    const g = getGear('season_emblem');
    expect(g.slot).toBe('relic');
    expect(isInstancedSlot(g.slot)).toBe(false);
    expect(g.recipe).toBeUndefined();
    expect(g.unique).toBeUndefined();
    expect(g.cost).toBe(0);
    expect(applyForge({ ...defaultSave(), gold: 1e9 }, 'season_emblem', { level: 100 }).reason).toBe('unknown');
    expect(merchantPrice('material', 'season_emblem')).toBe(0);
    expect(merchantBuys('consumable', 'season_emblem')).toBe(false);
    const s = withRelic({ ...base, inventory: { season_emblem: 2 } }, 'season_emblem');
    expect(applyDiscard(s, 'gear', 'season_emblem', 'all')!.inventory.season_emblem).toBe(1); // the worn copy is kept
  });

  it('effects: +5 % character XP, +5 % gold (inside the cap) and +2 % final damage, nothing else moves', () => {
    const b = buildCombatStats(base);
    const e = buildCombatStats(withRelic(base, 'season_emblem'));
    expect(e.xpBonus).toBe(5);
    expect(b.xpBonus).toBe(0);
    expect(e.goldBonus).toBe(5);
    expect(e.dmgBase / b.dmgBase).toBeCloseTo(1.02, 9);
    expect({ ...e, xpBonus: 0, goldBonus: 0, dmgBase: b.dmgBase }).toEqual(b);
    // gold goes through the same 25 % cap as every other source
    const withCoin = buildCombatStats(withRelic({ ...base }, 'goblin_lucky_coin'));
    expect(withCoin.goldBonus).toBe(10);
    expect(relicXpBonusPct('season_emblem')).toBe(5);
    expect(relicXpBonusPct('warchief_totem')).toBe(0);
    expect(relicXpBonusPct(null)).toBe(0);
  });

  it('Hunting reads the bonus from the session stats: character XP x1.05 and nothing else (Gold, drops and fights are the same)', () => {
    const zone = HUNTING_ZONES[0];
    const start = 5_000_000_000;
    const s = { ...defaultSave(), activeHuntingZone: zone.id, activeHuntingDepth: 'shallow' as const, huntingOfflineStart: start };
    const session = buildHuntSession(s, start);
    const mk = (xpBonus: number) => ({ ...s, huntSession: { ...session, stats: { ...session.stats, xpBonus } } });
    const plain = computeHuntingStatus(mk(0), start + 3 * HOUR);
    const emblem = computeHuntingStatus(mk(5), start + 3 * HOUR);
    expect(plain.xpReady).toBeGreaterThan(100);
    expect(Math.abs(emblem.xpReady / plain.xpReady - 1.05)).toBeLessThan(0.01);
    expect(emblem.goldReady).toBe(plain.goldReady);
    expect(emblem.drops).toEqual(plain.drops);
    // the session is saved with the bonus and loads back
    const loaded = normalizeSave(wire(mk(5)));
    expect(loaded.huntSession!.stats.xpBonus).toBe(5);
    // and a real equipped emblem is frozen into a fresh session
    expect(buildHuntSession(withRelic(s, 'season_emblem'), start).stats.xpBonus).toBe(5);
  });

  it('Delivery orders: the accepted order carries the relic bonus on top of the Pass bonus (decided at accept, frozen)', () => {
    const now = 1_800_000_000_000;
    let s: SaveData = { ...defaultSave(), xp: xpToReachLevel(30), hasBattlePass: true };
    s = ensureDeliveryOffers(s, now, mulberry32(1), true);
    const offer = s.deliveries.offers[0];
    const stocked = { ...s, materials: { ...emptyMaterials(), ...Object.fromEntries(Object.entries(offer.items).map(([m, q]) => [m, (q as number) + 5])) } as SaveData['materials'] };
    const a = applyDeliveryAccept(withRelic(stocked, null), offer.id, now, mulberry32(2), true)!;
    const b = applyDeliveryAccept(withRelic(stocked, 'season_emblem'), offer.id, now, mulberry32(2), true)!;
    expect(a.deliveries.active!.offer.xp).toBe(deliveryXp(offer, true));
    expect(b.deliveries.active!.offer.xp).toBe(deliveryXp(offer, true, 5));
    expect(b.deliveries.active!.offer.xp).toBeGreaterThan(a.deliveries.active!.offer.xp);
  });

  it('a sidegrade: its real combat value (ln of the duel margin) is clearly BELOW the weakest combat relic at levels 30 / 60 / 90', () => {
    const combat = ['ring_vitality', 'amulet_swiftness', 'berserker_crest', 'warchief_totem', 'lich_phylactery', 'overlord_sigil'];
    for (const [tk, lv] of [['3', 30], ['4g', 60], ['5', 90]] as [string, number][]) {
      const h = hero(tk, 4, { level: lv });
      const fl = repFloor(h);
      const lnP = (id: string) => Math.log(duel(withRelic(h, id), fl).P / duel(h, fl).P);
      const emblem = lnP('season_emblem');
      const weakest = Math.min(...combat.map(lnP));
      expect(emblem, `level ${lv}`).toBeGreaterThan(0); // +2 % damage is still something
      expect(emblem, `level ${lv}: emblem ${emblem.toFixed(4)} vs weakest ${weakest.toFixed(4)}`).toBeLessThan(weakest * 0.6);
    }
  });

  it('stat lines are generated from the data and the descriptions are digit-free', () => {
    const text = gearStatLines(getGear('season_emblem')).map((l) => l.text).join(' | ');
    expect(text).toMatch(/5/);
    expect(text).toMatch(/2/);
    expect(text).not.toMatch(/\{|undefined|NaN/);
    expect(GEAR.filter((g) => g.xpBonusPct).map((g) => g.id)).toEqual(['season_emblem']);
  });
});

describe("Blacksmith's Seal (forge_seal)", () => {
  const item = GEAR.find((g) => g.recipe && !g.recipe.items && isInstancedSlot(g.slot) && !g.unique && (g.tier ?? 0) === 1)!;
  const stocked = (seals: number): SaveData => {
    const materials = { ...emptyMaterials() } as Record<MaterialId, number>;
    for (const [m, q] of Object.entries(item.recipe!.materials ?? {})) materials[m as MaterialId] = (q as number) * 3;
    return { ...defaultSave(), gold: item.cost * 3 + 100, materials, consumables: { ...defaultSave().consumables, forge_seal: seals }, shards: 99, gems: { ruby: 9, sapphire: 9, emerald: 9 } };
  };

  it('the conditional rarity is the normal table restricted to Epic and better: 80 % / 20 %, derived from the weights, over many seeded rolls', () => {
    expect(FORGE_SEAL_MIN_RARITY).toBe('epic');
    const rng = mulberry32(20261010);
    const N = 200_000;
    const counts: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (let i = 0; i < N; i++) counts[rollRarityAtLeast('epic', rng)]++;
    const epic = RARITIES.find((r) => r.id === 'epic')!.chance;
    const legendary = RARITIES.find((r) => r.id === 'legendary')!.chance;
    expect(counts.common + counts.rare).toBe(0);
    expect(Math.abs(counts.epic / N - epic / (epic + legendary))).toBeLessThan(0.004);
    expect(Math.abs(counts.legendary / N - legendary / (epic + legendary))).toBeLessThan(0.004);
    expect(counts.epic / N).toBeCloseTo(0.8, 1);
    // expected legendaries from the three seals of a season
    expect((3 * legendary) / (epic + legendary)).toBeCloseTo(0.6, 9);
    // an unconditioned call is the plain table
    const plain: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const r2 = mulberry32(7);
    for (let i = 0; i < 50_000; i++) plain[rollRarityAtLeast('common', r2)]++;
    expect(Math.abs(plain.common / 50_000 - 0.6)).toBeLessThan(0.01);
  });

  it('a forge with the seal spends exactly one seal and the piece is Epic or better; without the toggle the seal stays', () => {
    const r = applyForge(stocked(2), item.id, { level: 100, seal: true, rng: mulberry32(3) });
    expect(r.ok).toBe(true);
    expect(r.sealUsed).toBe(true);
    expect(r.save!.consumables.forge_seal).toBe(1);
    expect(['epic', 'legendary']).toContain(r.instance!.rarity);
    expect(r.instance!.substats.length).toBeGreaterThanOrEqual(2);
    const plain = applyForge(stocked(2), item.id, { level: 100 });
    expect(plain.ok).toBe(true);
    expect(plain.sealUsed).toBeFalsy();
    expect(plain.save!.consumables.forge_seal).toBe(2);
  });

  it('a blocked / failed forge keeps the seal', () => {
    const poor = { ...stocked(1), gold: 0 };
    const refused = applyForge(poor, item.id, { level: 100, seal: true });
    expect(refused.ok).toBe(false);
    expect(poor.consumables.forge_seal).toBe(1);
    const noMats = { ...stocked(1), materials: emptyMaterials() };
    expect(applyForge(noMats, item.id, { level: 100, seal: true }).ok).toBe(false);
    const full = { ...stocked(1), inventory: {}, materials: { ...stocked(1).materials, copper: 99 * inventoryCapacity(defaultSave()) } };
    const bag = applyForge(full, item.id, { level: 100, seal: true });
    if (!bag.ok) expect(bag.reason).toBeDefined();
  });

  it('does not apply to relics, to a missing seal, to upgrade (refine) or to reforge', () => {
    const relicRecipe = GEAR.find((g) => g.slot === 'relic' && g.recipe)!;
    const mats = { ...emptyMaterials() } as Record<MaterialId, number>;
    for (const [m, q] of Object.entries(relicRecipe.recipe!.materials ?? {})) mats[m as MaterialId] = (q as number) * 2;
    const s = { ...stocked(1), gold: 1e6, materials: mats as SaveData['materials'] };
    const relic = applyForge(s, relicRecipe.id, { level: 100, seal: true });
    expect(relic.ok).toBe(true);
    expect(relic.sealUsed).toBe(false);
    expect(relic.save!.consumables.forge_seal).toBe(1);
    const none = applyForge(stocked(0), item.id, { level: 100, seal: true });
    expect(none.ok).toBe(true);
    expect(none.sealUsed).toBe(false);
    // a refine and a reforge never read it
    const crafted = applyForge(stocked(1), item.id, { level: 100 }).save!;
    const id = Object.keys(crafted.gearInstances).find((k) => crafted.gearInstances[k].templateId === item.id)!;
    const up = applyUpgrade({ ...crafted, gold: 1e7, materials: Object.fromEntries(MATERIALS.map((m) => [m.id, 999])) as SaveData['materials'], shards: 999 }, id, false, () => 0);
    expect(up?.save.consumables.forge_seal).toBe(1);
    const rf = applyReforge({ ...crafted, gold: 1e7, materials: Object.fromEntries(MATERIALS.map((m) => [m.id, 999])) as SaveData['materials'], shards: 999 }, id);
    if (rf) expect(rf.consumables.forge_seal).toBe(1);
  });

  it('cannot be sold to the merchant, is not a Shop item, and points at the Forge in "use in"', () => {
    const def = getConsumable('forge_seal')!;
    expect(def.purchasable).toBe(false);
    expect(def.sellValue).toBe(0);
    expect(merchantBuys('consumable', 'forge_seal')).toBe(false);
    expect(usesOf('consumable', 'forge_seal').some((u) => u.kind === 'forge' && u.refs.length > 0)).toBe(true);
  });
});

describe('Stash Deed (stash_deed)', () => {
  const withDeeds = (n: number, bonus = 0): SaveData => ({ ...defaultSave(), consumables: { ...defaultSave().consumables, stash_deed: n }, stashBonusSlots: bonus });

  it('each deed adds +5 stash slots for good, beyond the upgrade ladder, tracked in its own field', () => {
    const s = applyUseStashDeed(withDeeds(2))!;
    expect(s.stashBonusSlots).toBe(STASH_DEED_SLOTS);
    expect(s.consumables.stash_deed).toBe(1);
    expect(stashCapacity(s)).toBe(STASH_BASE_SLOTS + 5);
    expect(s.stash.level).toBe(0); // the ladder is untouched
    expect(normalizeSave(wire(s)).stashBonusSlots).toBe(5);
  });

  it('capped at +20 over all seasons: a deed used at the cap is refused and kept', () => {
    let s = withDeeds(6);
    for (let i = 0; i < 4; i++) s = applyUseStashDeed(s)!;
    expect(s.stashBonusSlots).toBe(STASH_BONUS_CAP);
    expect(stashCapacity(s)).toBe(STASH_BASE_SLOTS + STASH_BONUS_CAP);
    expect(stashDeedBlockReason(s)).toBe('cap');
    expect(applyUseStashDeed(s)).toBeNull();
    expect(s.consumables.stash_deed).toBe(2);
    expect(applyUseStashDeed(withDeeds(0))).toBeNull();
  });

  it('a tampered bonus loads clamped to the cap', () => {
    expect(normalizeSave(wire({ ...defaultSave(), stashBonusSlots: 999 })).stashBonusSlots).toBe(STASH_BONUS_CAP);
    expect(normalizeSave(wire({ ...defaultSave(), stashBonusSlots: -3 })).stashBonusSlots).toBe(0);
    expect(normalizeSave(wire({ ...defaultSave(), stashBonusSlots: 'x' })).stashBonusSlots).toBe(0);
  });

  it('is reward-only, reuses the camp_stash icon and cannot be sold', () => {
    const def = getConsumable('stash_deed')!;
    expect(def.iconUrl).toBe('/assets/icons/camp_stash.png');
    expect(def.sellValue).toBe(0);
    expect(merchantBuys('consumable', 'stash_deed')).toBe(false);
    expect(usesOf('consumable', 'stash_deed').some((u) => u.kind === 'use')).toBe(true);
  });
});

describe('hero skin (skin_golden_knight)', () => {
  it('level 30 of the premium track grants it with the emblem and the title (three things); it is selectable on and off and persists', () => {
    const s = applyBattlePassClaim(owner(), 30, 'premium', Date.now()).save!;
    expect(s.cosmetics).toEqual(expect.arrayContaining(['title_season_lv30', 'skin_golden_knight']));
    expect(s.inventory.season_emblem).toBe(1);
    expect(s.activeSkin).toBeNull();
    const on = applySelectSkin(s, 'skin_golden_knight')!;
    expect(on.activeSkin).toBe('skin_golden_knight');
    expect(normalizeSave(wire(on)).activeSkin).toBe('skin_golden_knight');
    expect(applySelectSkin(on, null)!.activeSkin).toBeNull();
    expect(normalizeSave(wire(applySelectSkin(on, null)!)).activeSkin).toBeNull();
  });

  it('falls back to the default knight for an unknown, un-owned or non-owner skin; a non-owner can never select it; old saves load with the default', () => {
    const owned = { ...owner(), cosmetics: ['skin_golden_knight'] };
    expect(normalizeSave(wire({ ...owned, activeSkin: 'skin_golden_knight' })).activeSkin).toBe('skin_golden_knight');
    expect(normalizeSave(wire({ ...owned, activeSkin: 'skin_nope' })).activeSkin).toBeNull();
    expect(normalizeSave(wire({ ...owner(), activeSkin: 'skin_golden_knight' })).activeSkin).toBeNull(); // not owned
    expect(normalizeSave(wire({ ...owned, hasBattlePass: false, activeSkin: 'skin_golden_knight' })).activeSkin).toBeNull(); // no Pass
    expect(applySelectSkin({ ...owned, hasBattlePass: false }, 'skin_golden_knight')).toBeNull();
    expect(applySelectSkin(owner(), 'skin_golden_knight')).toBeNull();
    expect(applySelectSkin(owned, 'skin_nope')).toBeNull();
    const old = wire(defaultSave());
    delete (old as unknown as Record<string, unknown>).activeSkin;
    expect(normalizeSave(old).activeSkin).toBeNull();
  });

  it('the sprite follows the selected skin and nothing else; the default and any unknown id draw the knight; the golden sheet is registered', () => {
    expect(playerSpriteUrl()).toBe('/assets/spritesheets/knight.png');
    expect(playerSpriteUrl(null)).toBe('/assets/spritesheets/knight.png');
    expect(playerSpriteUrl('skin_nope')).toBe('/assets/spritesheets/knight.png');
    expect(playerSpriteUrl('skin_golden_knight')).toBe('/assets/spritesheets/knight_golden.png');
  });
});

describe('portrait frame (frame_season_gold)', () => {
  it('level 15 of the premium track grants the cosmetic; it is selectable on and off and persists in the save', () => {
    const s = applyBattlePassClaim(owner(), 15, 'premium', Date.now()).save!;
    expect(s.cosmetics).toContain('frame_season_gold');
    expect(s.activeFrame).toBeNull();
    const on = applySelectFrame(s, 'frame_season_gold')!;
    expect(on.activeFrame).toBe('frame_season_gold');
    expect(normalizeSave(wire(on)).activeFrame).toBe('frame_season_gold');
    const off = applySelectFrame(on, null)!;
    expect(off.activeFrame).toBeNull();
    expect(normalizeSave(wire(off)).activeFrame).toBeNull();
  });

  it('cannot wear a frame that is not owned or does not exist; a tampered save loads without one', () => {
    expect(applySelectFrame(defaultSave(), 'frame_season_gold')).toBeNull();
    expect(applySelectFrame({ ...defaultSave(), cosmetics: ['x'] }, 'x')).toBeNull();
    expect(normalizeSave(wire({ ...defaultSave(), activeFrame: 'frame_season_gold' })).activeFrame).toBeNull();
    expect(normalizeSave(wire({ ...defaultSave(), cosmetics: ['frame_season_gold'], activeFrame: 'frame_season_gold' })).activeFrame).toBe('frame_season_gold');
    expect(FRAMES.map((f) => f.id)).toEqual(['frame_season_gold']);
  });
});

describe('bag with the new items', () => {
  it('seals and deeds stack like any consumable and take bag slots', () => {
    const s = owner({ consumables: { ...defaultSave().consumables, forge_seal: 3, stash_deed: 2 } });
    expect(inventorySlotsUsed(s)).toBe(2);
  });
});

describe('art and strings of the Adventurer Pass screen', () => {
  it('the season art and both 64 px icons ship, and every consumable / gear icon the track uses exists', () => {
    const files = new Set([...Object.keys(import.meta.glob('/public/assets/icons/*.png')), ...Object.keys(import.meta.glob('/public/assets/backgrounds/*.png'))]);
    for (const f of ['/public/assets/backgrounds/battlepass_season.png', '/public/assets/icons/season_emblem.png', '/public/assets/icons/forge_seal.png', '/public/assets/icons/camp_stash.png', '/public/assets/icons/garden_plot_locked.png']) expect(files.has(f), f).toBe(true);
    for (const l of BATTLE_PASS_TRACK) {
      for (const r of [l.free, l.premium]) {
        for (const one of [r, ...(r.also ?? [])]) {
          if (one.kind === 'consumable') expect(files.has(`/public${getConsumable(one.id!)!.iconUrl}`), `${l.level} ${one.id}`).toBe(true);
          if (one.kind === 'relic') expect(files.has(`/public${getGear(one.id!).icon}`), `${l.level} ${one.id}`).toBe(true);
        }
      }
    }
  });
});
