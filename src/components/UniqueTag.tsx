import { t } from '../locales';
import { getGear } from '../game/gear';

// The small gold "Único / Unique" tag shown next to the name of a drop-only piece, wherever a piece is named.
export default function UniqueTag({ templateId }: { templateId: string }) {
  if (!getGear(templateId)?.unique) return null;
  return <span className="unique-tag">{t('gear.unique')}</span>;
}
