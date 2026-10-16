// Which Hunting sub-level can a build win in the last zone (Rodada 22)? For every hero of a small ladder (level 60 to 90, a full set of tier 4 / 5 / 6 at +0 .. +12, common / epic /
// legendary pieces) it fights a pinned sub-level 1..10 of blood_abyss:deep for 2 hours (no promotion, no potions: the same method as huntEstimate.ts) and prints the win rate. The
// "reach" is the highest sub-level won at least 98% of the time: the ceiling a hero settles at. It is how the CP that each sub-level asks for was chosen (docs/BALANCE_CHANGES.md Rodada 22).
// Env: SUB_ZONE (blood_abyss), SUB_DEPTH (deep), SUB_DMG / SUB_HP override the sub-level growth for the zone (what-if), SUB_LEVELS (10).
import { it } from 'vitest';
import { buildCombatStats, buildHuntSimSetup, computeCP, huntPromotionRequiredWins, SaveData } from '../../src/game/engine';
import { getHuntingZone, HUNTING_ZONES, HuntingDepth } from '../../src/game/huntingZones';
import { simulateHuntingSession } from '../../src/game/huntCombat';
import { HuntSession } from '../../src/game/huntSession';
import { createGearInstance } from '../../src/game/gearInstances';
import { getGear } from '../../src/game/gear';
import { medianSubstatValue, RARITIES, rarityDef, Rarity, Substat, SUBSTATS } from '../../src/game/rarity';
import T from '../../src/game/tunables';
import { buildHero, TIER_EXTRAS, TIER_GEAR } from './ladder';
import { spendSkillPoints } from './driver';

const ORDER = ['critRate', 'maxHp', 'defense', 'critDamage', 'lifesteal'] as const;

export function setHero(level: number, tier: number, refine: number, rarity: Rarity): SaveData {
  let hero = buildHero(level, tier, refine, 100);
  const instances = { ...hero.gearInstances };
  const equipped = { ...hero.equipped } as unknown as Record<string, string>;
  const pieces: [string, string][] = [['weapon', TIER_GEAR[tier][0]], ['armor', TIER_GEAR[tier][1]], ...TIER_EXTRAS[tier]];
  for (const [slot, tpl] of pieces) {
    const def = rarityDef(rarity);
    const subs: Substat[] = ORDER.slice(0, def.substatCount).map((type) => ({ type, value: medianSubstatValue(SUBSTATS.find((s) => s.type === type)!, getGear(tpl)?.tier ?? tier, def.substatMult) }));
    const inst = createGearInstance(tpl, { id: `gi_${tpl}`, origin: 'craft', rarity, substats: subs, upgrade: refine });
    instances[inst.id] = inst;
    equipped[slot] = inst.id;
  }
  hero = { ...hero, gearInstances: instances, equipped: equipped as unknown as SaveData['equipped'] };
  return spendSkillPoints(hero, 'warrior');
}

export function winRateAt(hero: SaveData, zoneId: string, depth: HuntingDepth, subLevel: number, hours = 2): { winRate: number; kph: number } {
  const zone = getHuntingZone(zoneId)!;
  const stats = buildCombatStats(hero);
  const session: HuntSession = { stats, blessed: hero.blessed, strength: [], attack: [], pass: [], tonics: {} };
  const noPotions = { ...hero.consumables, greater_elixir: 0, large_hp: 0, small_hp: 0 };
  const { build, zoneCfg, timeline, potionCfg } = buildHuntSimSetup({ ...hero, consumables: noPotions }, zone, depth, session, 0, []);
  const r = simulateHuntingSession(build, zoneCfg, { ceiling: subLevel, promotionWins: 0 }, hours * 3600_000, potionCfg, `probe:${zoneId}:${depth}:${subLevel}`, { maxLevel: subLevel, requiredWins: huntPromotionRequiredWins }, timeline);
  const fights = r.kills + r.defeats;
  return { winRate: fights > 0 ? r.kills / fights : 0, kph: r.kills / hours };
}

it('prints the sub-level reach of the ladder', () => {
  const zoneId = process.env.SUB_ZONE ?? 'blood_abyss';
  const depth = (process.env.SUB_DEPTH ?? 'deep') as HuntingDepth;
  const levels = Number(process.env.SUB_LEVELS ?? T.hunting.subLevels);
  if (process.env.SIM_RARITY) for (const [id, over] of Object.entries(JSON.parse(process.env.SIM_RARITY) as Record<string, Record<string, number>>)) Object.assign(RARITIES.find((r) => r.id === id)!, over);
  if (process.env.SIM_ZONES) for (const [id, over] of Object.entries(JSON.parse(process.env.SIM_ZONES) as Record<string, Record<string, number>>)) Object.assign(HUNTING_ZONES.find((z) => z.id === id)!, over);
  const zone = getHuntingZone(zoneId)!;
  if (process.env.SUB_DMG) (zone as { subLevelDmgGrowth?: number }).subLevelDmgGrowth = Number(process.env.SUB_DMG);
  if (process.env.SUB_HP) (zone as { subLevelHpGrowth?: number }).subLevelHpGrowth = Number(process.env.SUB_HP);
  const cases: [string, number, number, number, Rarity][] = [];
  for (const [tier, refine] of [[3, 8], [4, 0], [4, 8], [5, 0], [5, 8], [5, 12], [6, 0], [6, 8], [6, 12]] as [number, number][]) {
    for (const rarity of ['common', 'epic', 'legendary'] as Rarity[]) {
      if (rarity !== 'common' && refine === 0) continue;
      cases.push([`T${tier}+${refine} ${rarity}`, tier >= 6 ? 90 : tier >= 5 ? 75 : 62, tier, refine, rarity]);
    }
  }
  const lines = [`${zoneId}:${depth}, recommended CP ${zone.cp}; win rate by sub-level (1..${levels}), reach = last sub-level with >= 98% wins`, 'hero | CP | ' + Array.from({ length: levels }, (_, i) => i + 1).join(' | ') + ' | reach'];
  for (const [label, level, tier, refine, rarity] of cases) {
    const hero = setHero(level, tier, refine, rarity);
    const rates: number[] = [];
    let reach = 0;
    for (let n = 1; n <= levels; n++) {
      const w = winRateAt(hero, zoneId, depth, n).winRate;
      rates.push(w);
      if (w >= 0.98 && reach === n - 1) reach = n;
    }
    lines.push(`${label} (lv ${level}) | ${Math.round(computeCP(hero))} | ${rates.map((w) => (w * 100).toFixed(0)).join(' | ')} | ${reach}`);
  }
  console.log(lines.join('\n'));
}, 3_600_000);
