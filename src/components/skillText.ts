import { activeLocale, t } from '../locales';
import { HeroSkillId, activeSkillRanks, nextSkillPointLevel, pointsSpent, skillParams, skillPointsEarned } from '../game/heroSkills';
import { playerLevel, type SaveData } from '../game/engine';

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

// The one sentence of the summary: the free skill points, or what was spent, or when the first point comes (Personagem shows it in the collapsed "Habilidades" line and in its body).
export function skillsSummaryText(save: SaveData): string {
  const level = playerLevel(save.xp);
  const spent = pointsSpent(activeSkillRanks(save));
  const free = Math.max(0, skillPointsEarned(level) - spent);
  const next = nextSkillPointLevel(level);
  const base = free > 0 ? t('heroSkills.ui.summaryFree', { n: free }) : skillPointsEarned(level) === 0 ? t('heroSkills.ui.firstPoint', { n: next ?? 5 }) : t('heroSkills.ui.summarySpent', { n: spent });
  return free === 0 && next !== null && skillPointsEarned(level) > 0 ? `${base} ${t('heroSkills.ui.nextPoint', { n: next })}` : base;
}
