import { fmtNum, t } from '../locales';
import { ClaimAllLine } from '../game/claimAll';
import { getMaterial } from '../game/materials';

// The one combined summary of the Home "Resgatar tudo": a line per activity that was collected.
function lineText(line: ClaimAllLine): { title: string; detail: string } {
  switch (line.kind) {
    case 'delivery':
      return { title: t('claimAll.delivery'), detail: t('claimAll.deliveryDetail', { g: fmtNum(line.gold), s: fmtNum(line.shards) }) };
    case 'hunt':
      return {
        title: t('claimAll.hunt'),
        detail:
          t('claimAll.huntDetail', { g: fmtNum(line.gold), x: fmtNum(line.xp), n: fmtNum(line.items) }) +
          (line.leftBehind > 0 ? ' · ' + t('claimAll.leftBehind', { n: fmtNum(line.leftBehind) }) : '') +
          (line.held ? ' · ' + t('claimAll.held') : ''),
      };
    case 'mining':
    case 'woodcutting': {
      const mat = getMaterial(line.material);
      return {
        title: t(line.kind === 'mining' ? 'claimAll.mining' : 'claimAll.woodcutting'),
        detail: `${mat ? t(`materials.${mat.nameKey}`) : line.material} x${fmtNum(line.units - line.leftBehind)}` + (line.leftBehind > 0 ? ' · ' + t('claimAll.leftBehind', { n: fmtNum(line.leftBehind) }) : ''),
      };
    }
    case 'garden':
      return { title: t('claimAll.garden'), detail: t('claimAll.gardenDetail', { n: line.harvested }) + (line.blocked > 0 ? ' · ' + t('claimAll.gardenBlocked', { n: line.blocked }) : '') };
  }
}

export default function ClaimAllModal({ lines, onClose }: { lines: ClaimAllLine[]; onClose: () => void }) {
  return (
    <div className="modal-backdrop ap-summary-backdrop">
      <div className="modal ap-summary" role="dialog" aria-label={t('claimAll.title')}>
        <h2 className="modal-title win">{t('claimAll.title')}</h2>
        <ul className="ap-summary-list">
          {lines.map((l, i) => {
            const text = lineText(l);
            return (
              <li className="ap-summary-row claimall-row" key={`${l.kind}${i}`}>
                <span className="ap-summary-name">{text.title}</span>
                <span className="claimall-detail">{text.detail}</span>
              </li>
            );
          })}
        </ul>
        <button className="quest-btn claim" onClick={onClose} data-ui>
          {t('claimAll.ok')}
        </button>
      </div>
    </div>
  );
}
