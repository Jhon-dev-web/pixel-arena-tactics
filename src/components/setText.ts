import { activeLocale, t } from '../locales';
import { SetFamily } from '../game/gear';
import { SET_EFFECT_KEYS, SetEffect } from '../game/setBonuses';

// The words of the set bonuses (components/SetBonus.tsx draws them). Texts come from the numbers in SET_DEFS, so a retuned bonus cannot disagree with the screen.

const num = (n: number): string => {
  const s = `${Math.round(n * 10) / 10}`;
  return activeLocale === 'pt' ? s.replace('.', ',') : s;
};

// One effect as a sentence, "+4% velocidade de ataque". Fractions (0.04) show as percents; lifesteal and gold are already whole percents.
export function setEffectText(effect: SetEffect): string {
  return SET_EFFECT_KEYS.filter((k) => effect[k])
    .map((k) => {
      const v = effect[k] as number;
      const shown = k === 'lifestealPct' || k === 'goldBonusPct' ? v : v * 100;
      return t(`set.effect.${k}`, { v: num(shown) });
    })
    .join(' · ');
}

export const setFamilyName = (family: SetFamily): string => t(`set.family.${family}`);
