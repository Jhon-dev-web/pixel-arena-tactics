import { fmtNum, t } from '../locales';
import { getConsumable } from './consumables';

// The words for a promo reward, in the active language: "Código resgatado: +25.000 Ouro", "+40 Éter", "+12 Elixir Maior". One place, used by the Settings message and the toast the game shows when a credit is applied.

export interface RewardLike {
  kind: 'pass' | 'gold' | 'shards' | 'consumable';
  itemId: string | null;
  amount: number | null;
}

/** The sentence for one reward. A potion the game does not know falls back to its id; the Pass has its own sentence. */
export function promoRewardText(r: RewardLike): string {
  if (r.kind === 'pass') return t('settings.promoOk');
  const n = fmtNum(r.amount ?? 0);
  if (r.kind === 'gold') return t('settings.promoGotGold', { n });
  if (r.kind === 'shards') return t('settings.promoGotShards', { n });
  const def = r.itemId ? getConsumable(r.itemId) : undefined;
  return t('settings.promoGotConsumable', { n, name: def ? t(`consumables.${def.nameKey}`) : (r.itemId ?? '') });
}

/** One toast for several credits applied together ("… · …"). */
export const promoRewardsToast = (list: readonly RewardLike[]): string => list.map(promoRewardText).join(' · ');
