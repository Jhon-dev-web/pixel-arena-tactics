// Measures what an hour of Hunting is worth to heroes of different levels, to size the delivery order rewards (docs/BALANCE_CHANGES.md Rodada 14).
// Value of an hour = Gold + (materials per hour x economy.ts baseGoldValue): the game's one economic reference, the same one the order cargo is sized in.
// For each hero: the best unlocked zone and depth the hero wins ('always' outlook), at a given zone sub-level. Run: npm run sim:orders
import { it } from 'vitest';
import { computeCP } from '../../src/game/engine';
import { huntValue, merchantGoldPerHour } from './orderHero';
import { deliveryTier } from '../../src/game/deliveries';
import { buildHero } from './ladder';
import T from '../../src/game/tunables';

const HEROES: { level: number; tier: number; refine: number; floor: number }[] = [
  { level: 1, tier: 0, refine: 0, floor: 1 },
  { level: 10, tier: 1, refine: 4, floor: 12 },
  { level: 20, tier: 2, refine: 4, floor: 26 },
  { level: 30, tier: 3, refine: 4, floor: 51 },
  { level: 50, tier: 4, refine: 4, floor: 76 },
  { level: 75, tier: 5, refine: 4, floor: 100 },
  { level: 100, tier: 6, refine: 8, floor: 100 },
];

it('prints the value of an hour of hunting by hero', () => {
  const D = T.deliveries;
  const lines: string[] = ['level | CP | order tier | order Gold/h today (local..especial) | hunt value/h @ sub-level 1 (gold + mats) | @5 | @10 | xp/h'];
  for (const h of HEROES) {
    const hero = buildHero(h.level, h.tier, h.refine, h.floor);
    const tier = deliveryTier(hero);
    const today = [D.goldBonusLocal, D.goldBonusCurta, D.goldBonusRegional, D.goldBonusLonga, D.goldBonusEspecial].map((b) => (D.goldPerHourBase + D.goldPerHourTier * tier + b).toFixed(1)).join('/');
    const parts = [1, 5, 10].map((c) => {
      const v = huntValue(hero, c);
      return v ? `${v.zone}/${v.depth} ${v.value.toFixed(0)} (g ${v.gold.toFixed(0)} m ${v.mats.toFixed(0)} k/h ${v.kph.toFixed(0)}; sold to the merchant ${merchantGoldPerHour(v).toFixed(0)}/h)` : 'none';
    });
    const v5 = huntValue(hero, 5);
    lines.push(`L${h.level} | ${computeCP(hero)} | ${tier} | ${today} | ${parts.join(' | ')} | xp ${v5 ? v5.xp.toFixed(0) : '-'}`);
  }
  console.log(lines.join('\n'));
});
