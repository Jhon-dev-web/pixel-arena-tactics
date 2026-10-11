import { activeLocale, t } from '../locales';
import { HeroSkillId, skillParams } from '../game/heroSkills';

// 4 -> "4", 0.9 -> "0.9" / "0,9": whole numbers stay whole, one decimal otherwise, the active language's separator.
export function fmtSkillNumber(n: number): string {
  const s = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));
  return activeLocale === 'pt' ? s.replace('.', ',') : s;
}

// The description of a skill at `rank`, every number filled from the data (heroSkills.ts skillParams), never typed into the locale text.
export function skillText(id: HeroSkillId, rank: number): string {
  const raw = skillParams(id, Math.max(1, rank));
  const params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, fmtSkillNumber(v)]));
  return t(`heroSkills.skills.${id}.desc`, params);
}
