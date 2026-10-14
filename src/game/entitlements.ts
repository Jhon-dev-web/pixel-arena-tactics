import type { SaveData } from './engine';
import { withSessionWindow } from './huntSession';
import T from './tunables';

// THE only place that decides whether the hero owns the Adventurer Pass (the permanent unlock: perks + the premium track). Everything else asks
// ownsAdventurerPass(); nothing reads save.hasBattlePass directly.
//
// Two sources of truth, chosen once at startup (GameShell):
//  - 'save' (default; the desktop/offline build, which has no Supabase variables): the save's `hasBattlePass` flag, exactly as before. Steam will own
//    this entitlement later (desktop/main.cjs has the IPC placeholder; ownsAdventurerPass will additionally ask the Steamworks bridge for the DLC).
//    Old saves that ever activated the Pass under the 30-day model keep `hasBattlePass: true` and are owners for good.
//  - 'server' (the web build with Supabase configured): ownership is the row in the server's `entitlements` table (src/game/passServer.ts fetches it).
//    The save's flag is IGNORED for every decision and is overwritten from the server value, so editing the save to `hasBattlePass: true` gains nothing.
type PassSource = 'save' | 'server';
let passSource: PassSource = 'save';
let serverOwned = false;
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};

export function setPassSource(source: PassSource): void {
  if (passSource === source) return;
  passSource = source;
  if (source === 'save') serverOwned = false;
  bump();
}
export const isServerPassSource = (): boolean => passSource === 'server';
/** What the server said last (false until the first answer, and when signed out). Only meaningful in 'server' mode. */
export const getServerPassOwned = (): boolean => serverOwned;
export function setServerPassOwned(owned: boolean): void {
  if (serverOwned === owned) return;
  serverOwned = owned;
  bump();
}
// For React (useSyncExternalStore): the snapshot changes whenever the source or the server answer changes.
export const subscribePassEntitlement = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const passEntitlementVersion = (): number => version;

export function ownsAdventurerPass(save: Pick<SaveData, 'hasBattlePass'>): boolean {
  return passSource === 'server' ? serverOwned : !!save.hasBattlePass;
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

// The 'save' source: production builds cannot obtain the Pass by themselves (the web build buys it through passServer.ts, Steam will sell it later);
// a DEV build grants it so the feature can be tested.
export const ADVENTURER_PASS_TESTABLE: boolean = import.meta.env.DEV;

export interface PassPurchaseResult {
  ok: boolean;
  reason?: 'unavailable';
  save: SaveData;
}

export function purchaseAdventurerPass(save: SaveData, now: number): PassPurchaseResult {
  if (ownsAdventurerPass(save)) return { ok: true, save };
  if (passSource === 'server') return { ok: false, reason: 'unavailable', save }; // the server decides; no client-side grant exists in this mode
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
