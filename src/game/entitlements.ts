import type { SaveData } from './engine';
import { withSessionWindow } from './huntSession';

// THE only place that decides whether the hero owns the Adventurer Pass (the permanent unlock: perks + the premium track). Everything else asks
// ownsAdventurerPass(); nothing reads save.hasBattlePass directly.
//
// Today ownership is the save's `hasBattlePass` flag, which only a DEV build can set (purchaseAdventurerPass below). When the game ships on Steam
// the Pass becomes a DLC ("Passe de Aventureiro"): ownsAdventurerPass() will additionally (or instead) ask the Steamworks bridge whether the
// player's account owns that DLC (desktop/main.cjs has the matching IPC placeholder), and purchaseAdventurerPass() will open the Steam overlay's store page.
// Old saves that ever activated the Pass under the 30-day model keep `hasBattlePass: true` and are owners for good.
export function ownsAdventurerPass(save: Pick<SaveData, 'hasBattlePass'>): boolean {
  return !!save.hasBattlePass;
}

// Production builds cannot obtain the Pass (no purchase flow exists yet); a DEV build grants it so the feature can be tested.
export const ADVENTURER_PASS_TESTABLE: boolean = import.meta.env.DEV;

export interface PassPurchaseResult {
  ok: boolean;
  reason?: 'unavailable';
  save: SaveData;
}

export function purchaseAdventurerPass(save: SaveData, now: number): PassPurchaseResult {
  if (ownsAdventurerPass(save)) return { ok: true, save };
  if (!ADVENTURER_PASS_TESTABLE) return { ok: false, reason: 'unavailable', save };
  return {
    ok: true,
    save: {
      ...save,
      hasBattlePass: true,
      // A running Hunting session only gets the pass bonus (drops, longer cap) from the purchase on; Mining / Woodcutting keep the snapshot they started with.
      huntSession: save.huntSession ? withSessionWindow(save.huntSession, 'pass', { from: now, to: null }) : save.huntSession,
    },
  };
}
