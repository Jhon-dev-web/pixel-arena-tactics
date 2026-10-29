// How much of a class's power comes from its abilities, tier by tier (phase 8). The hypothesis under test: the cooldowns are absolute (ms) but a fight lasts longer at a low tier, so more shots fit in a fight and the
// SHARE of the power that is ability grows when the tier falls; the class with the strongest fixed-cooldown ability then wins the long-fight axes (the warrior's Firm Strike at tier 3).
//   power share  = 1 - (rate of the SAME hero with an empty rotation) / (rate with his rotation), rate = kills an hour in Hunting, 1 / time to kill for the boss. 0.2 = the abilities are a fifth of the speed.
//   fights       = how long a fight is, in swings of the hero, and how many ability shots fall in one fight.
// npx vitest run --config vitest.sim.config.ts abilityShare --silent=false --reporter=default. It measures; it writes nothing.
import { it } from 'vitest';
import { buildCombatStats, buildHuntSimSetup, huntPromotionRequiredWins, SaveData } from '../../src/game/engine';
import { getHuntingZone } from '../../src/game/huntingZones';
import { simulateHuntingSession } from '../../src/game/huntCombat';
import { HuntSession } from '../../src/game/huntSession';
import { bossKill } from './duel';
import { CLASS_MAIN, classHero } from './classHero';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const TIERS: [string, number, number, number][] = [['T2 +4', 2, 20, 4], ['T3 +8', 3, 45, 8], ['T4 +8', 4, 62, 8], ['T5 +8', 5, 75, 8], ['T6 +8', 6, 100, 8]];

function hunt(h: SaveData, zoneId: string, pin: number): { kph: number; fightMs: number; fired: number; swings: number } {
  const zone = getHuntingZone(zoneId)!;
  const stats = buildCombatStats(h);
  const session: HuntSession = { stats, blessed: h.blessed, strength: [], attack: [], pass: [], tonics: {} };
  const noPotions = { ...h.consumables, greater_elixir: 0, large_hp: 0, small_hp: 0 };
  const { build, zoneCfg, timeline, potionCfg } = buildHuntSimSetup({ ...h, consumables: noPotions }, zone, 'shallow', session, 0, []);
  const hours = 2;
  const r = simulateHuntingSession(build, zoneCfg, { ceiling: pin, promotionWins: 0 }, hours * 3600_000, potionCfg, `share:${zoneId}:${pin}`, { maxLevel: pin, requiredWins: huntPromotionRequiredWins }, timeline);
  const fired = Object.values(r.abilityFired ?? {}).reduce((a, b) => a + (b as number), 0);
  const fightMs = (hours * 3600_000) / Math.max(1, r.kills + r.defeats);
  return { kph: r.kills / hours, fightMs, fired, swings: fightMs / stats.heroMs };
}

it('prints the ability share by tier', () => {
  const out: string[] = ['| tier | classe | Caça: duração da luta (s) | golpes por luta | disparos por luta | fatia de habilidade (kills/h) | Chefe 50: duração (s) | golpes por luta | fatia de habilidade (velocidade) |', '| --- | --- | --: | --: | --: | --: | --: | --: | --: |'];
  for (const [label, tier, level, refine] of TIERS) {
    for (const b of CLASS_MAIN) {
      const h = classHero(b, level, tier, refine, 'real');
      const bare = { ...h, rotation: [] } as unknown as SaveData;
      const zone = tier <= 2 ? 'blood_marsh' : tier <= 3 ? 'demon_rift' : 'blood_abyss';
      const w = hunt(h, zone, 5);
      const n = hunt(bare, zone, 5);
      const ms = buildCombatStats(h).heroMs;
      const bw = bossKill(h, 50, NOW, 24).ms;
      const bn = bossKill(bare, 50, NOW, 24).ms;
      out.push(`| ${label} | ${b.id} | ${(w.fightMs / 1000).toFixed(1)} | ${w.swings.toFixed(1)} | ${(w.fired / Math.max(1, w.kph * 2)).toFixed(2)} | ${(1 - n.kph / w.kph).toFixed(3)} | ${(bw / 1000).toFixed(1)} | ${(bw / ms).toFixed(1)} | ${(1 - bw / bn).toFixed(3)} |`);
    }
  }
  console.log(out.join(String.fromCharCode(10)));
}, 600_000);
