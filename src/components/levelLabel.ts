import { t } from '../locales';
import { MAX_LEVEL, playerLevel, xpForNextLevel, xpToReachLevel, type SaveData } from '../game/engine';
import { paragonLevel, paragonProgress } from '../game/paragon';

// "Nv 100" while the hero levels up, "Nv 100 · Paragon 3" once the XP counts into paragon levels (paragon.ts).
// `compact` (the narrow top bars): "Nv 100 · P12".
export function levelLabel(save: Pick<SaveData, 'xp'>, compact = false): string {
  const base = t('camp.level', { n: playerLevel(save.xp) });
  const p = paragonLevel(save.xp);
  return p > 0 ? `${base} · ${t(compact ? 'paragon.tiny' : 'paragon.short', { n: p })}` : base;
}

// 0..1 progress of the XP bar: toward the next hero level, or toward the next paragon level at the cap.
export function levelBarProgress(save: Pick<SaveData, 'xp'>): number {
  const level = playerLevel(save.xp);
  if (level >= MAX_LEVEL) {
    const p = paragonProgress(save.xp);
    return Math.max(0, Math.min(1, p.into / Math.max(1, p.need)));
  }
  return Math.max(0, Math.min(1, (save.xp - xpToReachLevel(level)) / Math.max(1, xpForNextLevel(level))));
}
