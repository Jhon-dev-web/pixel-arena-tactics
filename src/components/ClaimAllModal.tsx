import { fmtNum, t } from '../locales';
import { ClaimAllLine } from '../game/claimAll';
import { getMaterial } from '../game/materials';
import { Button, Dialog } from './ui';

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
    <Dialog
      tone="win"
      title={t('claimAll.title')}
      footer={
        <Button variant="primary" block onClick={onClose}>
          {t('claimAll.ok')}
        </Button>
      }
    >
      <ul className="dlg-list">
        {lines.map((l, i) => {
          const text = lineText(l);
          return (
            <li className="dlg-row" key={`${l.kind}${i}`}>
              <span className="dlg-row-name">{text.title}</span>
              <span className="dlg-row-detail">{text.detail}</span>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
