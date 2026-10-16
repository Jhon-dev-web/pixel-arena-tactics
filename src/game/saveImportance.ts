import type { SaveData } from './engine';
import { playerLevel } from './engine';
import { paragonLevel } from './paragon';

// Which changes of the save must reach the server at once instead of waiting for the next batch (saveScheduler.ts). The rest of the game (gold, materials, a hunt that ticks over) is cheap to
// lose a few seconds of; these are the moments a player or the server would notice: a level, a boss, the Pass, the League, and anything that carries a server certificate. Pure and shallow:
// it looks at the fields that decide it, never at the whole object, so it is cheap to run on every change.

const certificateSignature = (s: SaveData): string => {
  const ids: string[] = [];
  for (const g of Object.values(s.gearInstances)) if (g.certificateId) ids.push(g.certificateId);
  if (s.pouchCerts) for (const list of Object.values(s.pouchCerts)) if (list) ids.push(...list);
  if (s.legacyPouchCerts) ids.push(...s.legacyPouchCerts);
  return ids.sort().join(',');
};

/** True when going from `prev` to `next` is worth an immediate upload. */
export function isImportantChange(prev: SaveData, next: SaveData): boolean {
  if (prev === next) return false;
  if (next.xp !== prev.xp && (playerLevel(next.xp) > playerLevel(prev.xp) || paragonLevel(next.xp) > paragonLevel(prev.xp))) return true; // a level (paragon included)
  if ((next.stats?.bossesKilled ?? 0) > (prev.stats?.bossesKilled ?? 0)) return true; // a boss kill
  if (!!next.hasBattlePass !== !!prev.hasBattlePass || next.passSeason !== prev.passSeason) return true; // the Adventurer Pass
  if (next.league !== prev.league && JSON.stringify(next.league ?? null) !== JSON.stringify(prev.league ?? null)) return true; // the League mark
  if (next.eventBuffs !== prev.eventBuffs || next.eventPick !== prev.eventPick) return true; // League events earned / picked
  if (next.pendingBossClaims !== prev.pendingBossClaims || next.materialClaims !== prev.materialClaims) return true; // a server roll that is owed
  if (next.gearInstances !== prev.gearInstances || next.pouchCerts !== prev.pouchCerts || next.legacyPouchCerts !== prev.legacyPouchCerts) {
    if (certificateSignature(next) !== certificateSignature(prev)) return true; // a certified piece came or went
  }
  return false;
}
