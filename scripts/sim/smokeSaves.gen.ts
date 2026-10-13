// Writes the three saves the UI smoke test loads (npm run smoke:ui): a brand-new hero, a mid-game hero and an end-game hero with paragon levels and
// Profundezas depths. Not a balance tool: it only builds saves out of the sim's own hero constructor (ladder.ts buildHero) so the screens that only exist
// late in the game (sets, paragon, depths, a long inventory) have real data on them. Output: smoke-out/saves.json (git-ignored).
import fs from 'node:fs';
import { it } from 'vitest';
import { defaultSave, SaveData, xpToReachLevel } from '../../src/game/engine';
import { paragonLevelXp, paragonStartXp } from '../../src/game/paragon';
import { buildHero } from './ladder';
import { unlockedZoneIds } from '../../src/game/huntingZones';
import { emptyMaterials, MATERIALS } from '../../src/game/materials';

const withStuff = (hero: SaveData, over: Partial<SaveData>): SaveData => ({
  ...hero,
  seenWelcome: true,
  tutorial: { initial: 'completed', initialStep: 'final', seen: ['garden', 'mining', 'woodcutting', 'deliveries', 'reforge', 'sockets', 'skills'] as never, automatic: false },
  ...over,
});

it('writes smoke-out/saves.json', () => {
  const stock = emptyMaterials();
  for (const m of MATERIALS) stock[m.id] = 12;

  const fresh = defaultSave();

  const midHero = buildHero(40, 3, 4, 50);
  const mid = withStuff(midHero, {
    gold: 48_000,
    shards: 40,
    materials: stock,
    dungeonCheckpoints: [25, 50],
    unlockedHuntingZones: unlockedZoneIds(50),
    stats: { ...midHero.stats, kills: 1800, deepestDepth: 0 },
  });

  let endHero = buildHero(100, 6, 8, 100);
  endHero = { ...endHero, xp: paragonStartXp() + paragonLevelXp(1) * 20 };
  const end = withStuff(endHero, {
    gold: 12_500_000,
    shards: 900,
    materials: stock,
    dungeonCheckpoints: [25, 50, 75, 100],
    unlockedHuntingZones: unlockedZoneIds(100),
    stats: { ...endHero.stats, kills: 90_000, deepestDepth: 14, dungeonRuns: 300 },
  });
  void xpToReachLevel;

  fs.mkdirSync('smoke-out', { recursive: true });
  fs.writeFileSync('smoke-out/saves.json', JSON.stringify({ new: fresh, mid, end }));
});
