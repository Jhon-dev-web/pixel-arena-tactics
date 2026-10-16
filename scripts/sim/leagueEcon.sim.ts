// League economy policies (Rodada 22). Plays ONE policy for a list of seeds, 60 days, and writes one JSON per seed; scripts/sim/leagueEcon.mjs (`npm run sim:econ`) spreads the policies
// and seeds over processes and prints the comparison. It asserts nothing and is NOT part of `npm test`.
//
// The policies (all play the same Player as `npm run sim:long`, with the same seeded Math.random and check-in jitter, so two policies of one seed differ only by the policy):
//   A   no Pass, the usual player.                      P   the same with the Adventurer Pass.
//   AS  A + smart.                                      PS  P + smart: once the LAST Hunting zone is open at its deep depth he hunts only there (Player.startBestXp).
//   AG  / PG  the review's smart: GREEDY, only the last zone's deep depth once it is open (never mines, never forges again for lack of materials).
//   PB  P + smart + BUYER of a legendary tier 4+ set: every gear recipe of tier 4, 5 and 6 costs nothing (the piece still needs its hero level) and rolls Legendary.
//   PBE the same with Epic.  PB4 / PB4E: buys ONLY the tier 4 set (Legendary / Epic); tiers 5 and 6 he forges like everybody else. AB / ABE: the buyer without the Pass.
// "Smart non-buyer vs buyer" (PS vs PB) is the number the League review cared about: how many levels buying a set is worth to an equally good Pass owner.
// Env: LEAGUE_POLICY (required), LEAGUE_SEEDS ("1,2,3,4,5,6"), LEAGUE_DAYS (60), LEAGUE_OUT (dir), LEAGUE_TAG (file prefix).
// SIM_T / SIM_ZONES: same overrides as longHaul.sim.ts, for what-ifs without editing the tunables.
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import T from '../../src/game/tunables';
import { GEAR, getGear } from '../../src/game/gear';
import { HUNTING_ZONES } from '../../src/game/huntingZones';
import { Rarity } from '../../src/game/rarity';
import { MAX_LEVEL, playerLevel, xpForNextLevel, xpToReachLevel } from '../../src/game/engine';
import { paragonLevel } from '../../src/game/paragon';
import { mulberry32, withSeededRandom } from './driver';
import { Player, PlayerOptions } from './player';

if (process.env.SIM_T) {
  for (const [group, vals] of Object.entries(JSON.parse(process.env.SIM_T) as Record<string, Record<string, number>>)) Object.assign((T as unknown as Record<string, Record<string, number>>)[group], vals);
}
if (process.env.SIM_ZONES) {
  for (const [id, over] of Object.entries(JSON.parse(process.env.SIM_ZONES) as Record<string, Record<string, number>>)) Object.assign(HUNTING_ZONES.find((z) => z.id === id)!, over);
}

export const POLICIES: Record<string, PlayerOptions> = {
  A: { long: true },
  P: { long: true, pass: true },
  AS: { long: true, smart: true },
  PS: { long: true, pass: true, smart: true },
  AG: { long: true, greedy: true },
  PG: { long: true, pass: true, greedy: true },
  AB: { long: true, smart: true, buyer: { fromTier: 4, rarity: 'legendary' } },
  PB: { long: true, pass: true, smart: true, buyer: { fromTier: 4, rarity: 'legendary' } },
  ABE: { long: true, smart: true, buyer: { fromTier: 4, rarity: 'epic' } },
  PBE: { long: true, pass: true, smart: true, buyer: { fromTier: 4, rarity: 'epic' } },
  PB4: { long: true, pass: true, smart: true, buyer: { fromTier: 4, toTier: 4, rarity: 'legendary' } },
  PB4E: { long: true, pass: true, smart: true, buyer: { fromTier: 4, toTier: 4, rarity: 'epic' } },
};

const POLICY = process.env.LEAGUE_POLICY ?? 'P';
const SEEDS = (process.env.LEAGUE_SEEDS ?? '1,2,3,4,5,6').split(',').map(Number);
const DAYS = Number(process.env.LEAGUE_DAYS ?? 60);
const OUT = process.env.LEAGUE_OUT ?? path.join(os.tmpdir(), 'arena-league-econ');
const TAG = process.env.LEAGUE_TAG ?? 'run';
const START = new Date(2026, 5, 1, 0, 0, 0).getTime();

const opts = POLICIES[POLICY];
if (opts?.buyer) {
  // Market gear costs the buyer no materials and no Gold (the level gate of the recipe stays: he cannot wear a piece he could not have forged at his level).
  for (const g of GEAR) {
    if (g.recipe && (g.tier ?? 0) >= opts.buyer.fromTier && (g.tier ?? 0) <= (opts.buyer.toTier ?? 99) && !(g as { unique?: boolean }).unique) {
      g.recipe.materials = {} as never;
      g.recipe.items = {} as never;
      (g.recipe as { gems?: unknown }).gems = undefined;
      (g.recipe as { shards?: unknown }).shards = undefined;
      g.cost = 0;
    }
  }
}

/** Hero level plus the share of the next level; 100 + paragon levels past the cap. */
export function levelPosition(xp: number): number {
  const level = playerLevel(xp);
  if (level >= MAX_LEVEL) return MAX_LEVEL + paragonLevel(xp);
  return level + (xp - xpToReachLevel(level)) / xpForNextLevel(level);
}

describe('league economy policies', () => {
  beforeAll(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterAll(() => vi.useRealTimers());
  it('plays', () => {
    if (!opts) throw new Error(`unknown policy ${POLICY}`);
    fs.mkdirSync(OUT, { recursive: true });
    for (const seed of SEEDS) {
      const run = withSeededRandom(seed * 7919 + 13, () => {
        const jitter = mulberry32(seed * 104729 + 7);
        const p = new Player((t) => vi.setSystemTime(t), START, opts);
        const seen = new Set<string>();
        const days: unknown[] = [];
        for (let d = 0; d < DAYS; d++) {
          p.playDay(d, jitter);
          const snap = p.snapshots[d];
          const fresh: { tpl: string; tier: number; rarity: string; origin: string; unique: boolean }[] = [];
          for (const i of Object.values(p.S.gearInstances)) {
            if (seen.has(i.id)) continue;
            seen.add(i.id);
            const g = getGear(i.templateId) as { tier?: number; unique?: boolean } | undefined;
            fresh.push({ tpl: i.templateId, tier: g?.tier ?? 0, rarity: i.rarity as Rarity, origin: i.origin, unique: !!g?.unique });
          }
          const L = snap.ledger;
          days.push({
            lvl: levelPosition(p.S.xp),
            level: snap.level,
            xp: p.S.xp,
            floor: snap.floor,
            cp: snap.cp,
            gold: snap.gold,
            worn: snap.wornTiers,
            goldIn: L.goldIn,
            goldOut: L.goldOut,
            hunt: Object.fromEntries(Object.entries(L.hunt).map(([k, v]) => [k, v.hours])),
            hours: L.hours,
            xpIn: L.xpIn,
            uniques: L.uniques,
            fresh,
            elixir: L.elixir,
            ceil: Object.fromEntries(Object.entries(p.S.huntProgress).map(([k, v]) => [k, v.ceiling])),
          });
          snap.ledger = null as never;
        }
        return days;
      });
      fs.writeFileSync(path.join(OUT, `${TAG}-${POLICY}-${seed}.json`), JSON.stringify(run));
      console.log(`${TAG} ${POLICY}${seed}: level ${(run[DAYS - 1] as { lvl: number }).lvl.toFixed(1)}`);
    }
  });
});
