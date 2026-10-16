import { t } from '../../locales';
import { getConsumable } from '../../game/consumables';
import { getGear } from '../../game/gear';
import { getMaterial, MaterialId } from '../../game/materials';
import { materialRarity } from '../../game/wholesale';

/** The frame colour of a material: its class in the game (common, uncommon, rare) read as the item rarities. */
export const materialFrame = (id: string): 'common' | 'rare' | 'epic' => {
  const klass = getMaterial(id as MaterialId) ? materialRarity(id as MaterialId) : 'common';
  return klass === 'rare' ? 'epic' : klass === 'uncommon' ? 'rare' : 'common';
};

/** The name of a market item in the active language (an unknown template shows its id, never a crash). A 'material' is a lot of one tradeable material: its name is the material's. */
export function itemName(item: { kind: 'gear' | 'unique' | 'gold_pouch' | 'material'; templateId: string }): string {
  if (item.kind === 'material') {
    const def = getMaterial(item.templateId as MaterialId);
    return def ? t(`materials.${def.nameKey}`) : item.templateId;
  }
  if (item.kind === 'gold_pouch') {
    const def = getConsumable(item.templateId);
    return def ? t(`consumables.${def.nameKey}`) : item.templateId;
  }
  const def = getGear(item.templateId);
  return def ? t(`gear.${def.nameKey}`) : item.templateId;
}
