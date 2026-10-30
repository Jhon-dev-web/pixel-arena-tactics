import { t } from '../locales';
import { playerLevel, type SaveData } from '../game/engine';
import { affinityView } from '../game/affinity';
import { equippedSetItems } from '../game/gearInstances';
import { SetFamilyView, wornSetViews } from '../game/setBonuses';
import { setFamilyName } from './setText';

// The one-line heads of the equipment panel's set bonus and class affinity (HeroPanels.tsx shows them folded, the full lines open with a tap), and the attribute points the Atributos fold announces.
// Pure functions of the save, kept out of the components so the screens and the tests read the same text.

// "Aço 3/5": the family and how many of the highest threshold's pieces are worn.
export const progressLabel = (v: SetFamilyView): string => `${setFamilyName(v.family)} ${Math.min(v.count, v.max)}/${v.max}`;

// A family is listed when a bonus is active or the next one is one piece away (two for a three-piece step): the quiet middle ground between hiding the sets and listing every family the hero owns one piece of.
export function worthListing(v: SetFamilyView): boolean {
  if (v.steps.some((s) => s.active)) return true;
  const first = v.steps[0].pieces;
  return v.count >= first - 1;
}

/** "Conjunto Aço 5/5": one head per set the panel lists. */
export function setLineHeads(save: SaveData): string[] {
  return wornSetViews(equippedSetItems(save)).filter(worthListing).map((v) => `${t('set.title')} ${progressLabel(v)}`);
}

/** "Afinidade Placa 5/5", or null when no armor weight leads yet. */
export function affinityHead(save: SaveData): string | null {
  const view = affinityView(equippedSetItems(save));
  return view ? `${t('affinity.title')} ${t('affinity.head', { w: t(`affinity.weight.${view.weight}`), n: Math.min(view.pieces, 5) })}` : null;
}

/** The attribute points still to spend (3 per level). */
export function attrPointsLeft(save: SaveData): number {
  return Math.max(0, playerLevel(save.xp) * 3 - (save.str + save.vit + save.agi + save.res));
}
