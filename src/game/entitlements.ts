import type { SaveData } from './engine';
import { withSessionWindow } from './huntSession';
import T from './tunables';

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

// The Pass owner's daily Repair Kit (T.battlePass.dailyRepairKits): the first time the game sees a new local day it puts the kit(s) in the bag, over capacity if it must (the bag supports
// that), and remembers the day. A non-owner never gets one. Idempotent for a given day; a clock set back to an earlier day does not give a second one (the day only moves forward by string
// inequality, so a change of date after a change of date can give one again at most once per real change, never more than once per load).
export function grantDailyPassKit(save: SaveData, today: string): SaveData {
  if (!ownsAdventurerPass(save) || T.battlePass.dailyRepairKits <= 0 || save.passKitDay === today) return save;
  // A stock of unused kits never grows past the cap (one bag slot), the day is still marked as delivered.
  const have = save.consumables.repair_kit ?? 0;
  const give = Math.max(0, Math.min(T.battlePass.dailyRepairKits, T.battlePass.dailyRepairKitStock - have));
  return { ...save, passKitDay: today, consumables: give > 0 ? { ...save.consumables, repair_kit: have + give } : save.consumables };
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
