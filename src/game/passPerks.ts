import T from './tunables';
import { fmtNum } from '../locales';
import { pouchRuleParams } from './goldPouch';

// What the Adventurer Pass gives an owner, as the screen lists it: every number is read from the same tunables the engine reads (storage, gold, yield, orders,
// bag, stash, repair, the daily Repair Kit, the weekly streak saver), so the text cannot promise anything the code does not do. passPerks.test.ts checks each line against the real behaviour.
export interface PassPerkLine {
  key: string;
  icon: string;
  label: { key: string; params?: Record<string, number | string> };
  sub: { key: string; params?: Record<string, number | string> };
}

const pct = (x: number): number => Math.round(x * 100);

export function passPerkLines(): PassPerkLine[] {
  return [
    { key: 'storage', icon: '/assets/icons/expedition_ticket_4h.png', label: { key: 'battlePass.perkStorage', params: { n: T.battlePass.capHours } }, sub: { key: 'battlePass.perkStorageSub' } },
    { key: 'gold', icon: '/assets/icons/gold.png', label: { key: 'battlePass.perkGold', params: { n: pct(T.battlePass.goldBonus) } }, sub: { key: 'battlePass.perkGoldSub' } },
    { key: 'luck', icon: '/assets/icons/ore_gold.png', label: { key: 'battlePass.perkLuck', params: { n: pct(T.battlePass.dropRateMultiplier - 1) } }, sub: { key: 'battlePass.perkLuckSub' } },
    {
      key: 'orders',
      icon: '/assets/icons/nav_quests.png',
      label: { key: 'battlePass.perkDeliveries', params: { o: T.deliveries.offersPass - T.deliveries.offersBase, r: T.deliveries.rerollsPass - T.deliveries.rerollsBase } },
      sub: { key: 'battlePass.perkDeliveriesSub', params: { n: pct(T.deliveries.passXpBonus) } },
    },
    { key: 'bag', icon: '/assets/icons/nav_bag.png', label: { key: 'battlePass.perkBag', params: { n: pct(T.battlePass.bagBonusPct) } }, sub: { key: 'battlePass.perkBagSub', params: { n: T.battlePass.bagBonusSlots } } },
    { key: 'stash', icon: '/assets/icons/camp_stash.png', label: { key: 'battlePass.perkStash', params: { n: T.battlePass.stashBonusSlots } }, sub: { key: 'battlePass.perkStashSub' } },
    { key: 'repair', icon: '/assets/icons/whetstone_oil.png', label: { key: 'battlePass.perkRepair', params: { n: pct(T.battlePass.repairDiscount) } }, sub: { key: 'battlePass.perkRepairSub' } },
    { key: 'kit', icon: '/assets/icons/whetstone_oil.png', label: { key: 'battlePass.perkKit', params: { n: T.battlePass.dailyRepairKits } }, sub: { key: 'battlePass.perkKitSub', params: { m: T.consumables.repairKitDurability } } },
    { key: 'streak', icon: '/assets/icons/nav_quests.png', label: { key: 'battlePass.perkStreak', params: { n: T.battlePass.streakSavers } }, sub: { key: 'battlePass.perkStreakSub' } },
    { key: 'pouch', icon: '/assets/icons/gold_pouch.png', label: { key: 'battlePass.perkPouch', params: { min: fmtNum(pouchRuleParams().min) } }, sub: { key: 'battlePass.perkPouchSub', params: { fee: pouchRuleParams().fee, n: pouchRuleParams().n } } },
    { key: 'loadout', icon: '/assets/icons/skill_path_warrior.png', label: { key: 'battlePass.perkLoadout' }, sub: { key: 'battlePass.perkLoadoutSub' } },
  ];
}
