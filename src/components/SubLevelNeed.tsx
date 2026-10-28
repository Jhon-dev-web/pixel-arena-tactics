import { t } from '../locales';
import { subLevelNeed } from '../game/huntView';

// "To reach the next level of this zone, your gear must match a tier N +R set": the equipment-index gate (gearIndex.ts, huntingZones.ts subLevelGearRequired) said the way a player reads it.
export default function SubLevelNeed({ required }: { required: number }) {
  const need = subLevelNeed(required);
  const rarity = need.rarityKey ? t(need.rarityKey).toLowerCase() : '';
  return <p className="hs-hint">{t(need.key, { tier: need.tier, refine: need.refine, rarity })}</p>;
}
