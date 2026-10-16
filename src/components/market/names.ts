import { t } from '../../locales';
import { getConsumable } from '../../game/consumables';
import { getGear } from '../../game/gear';

/** The name of a market item in the active language (an unknown template shows its id, never a crash). */
export function itemName(item: { kind: 'gear' | 'unique' | 'gold_pouch'; templateId: string }): string {
  if (item.kind === 'gold_pouch') {
    const def = getConsumable(item.templateId);
    return def ? t(`consumables.${def.nameKey}`) : item.templateId;
  }
  const def = getGear(item.templateId);
  return def ? t(`gear.${def.nameKey}`) : item.templateId;
}
