import { fmtNum, t } from '../locales';
import { getMaterial, MaterialId } from '../game/materials';
import type { TradeableMap } from '../game/tradeableMaterials';
import { Button, ModalShell } from './ui';
import MaterialIcon from './MaterialIcon';

// Asked before the game spends tradeable materials (a recipe, a refine, an order that ran out of normal units) the first time, and every time a stack is sold to an NPC merchant: these units
// can be sold to other players, so the game says exactly how many of which material it is about to spend. Nothing happens until the player answers.
export default function TradeableUseModal({ used, npc, onConfirm, onCancel }: { used: TradeableMap; npc: boolean; onConfirm: () => void; onCancel: () => void }) {
  const rows = (Object.entries(used) as [MaterialId, number][]).filter(([, n]) => n > 0);
  const list = rows.map(([id, n]) => t('tradeable.line', { n: fmtNum(n), name: t(`materials.${getMaterial(id)?.nameKey ?? id}`) })).join(', ');
  return (
    <ModalShell className="tm-modal" title={t(npc ? 'tradeable.useNpcTitle' : 'tradeable.useTitle')} closeLabel={t('tradeable.useCancel')} onClose={onCancel}>
      <div className="tm-body" role="alertdialog" aria-label={t(npc ? 'tradeable.useNpcTitle' : 'tradeable.useTitle')}>
        <div className="tm-icons" aria-hidden>
          {rows.map(([id]) => {
            const def = getMaterial(id);
            return (
              def && (
                <span key={id} className="tm-icon">
                  <MaterialIcon item={def} />
                </span>
              )
            );
          })}
        </div>
        <p>{t(npc ? 'tradeable.useNpcText' : 'tradeable.useText', { list })}</p>
        <div className="tm-actions">
          <Button variant="primary" block onClick={onConfirm}>
            {t(npc ? 'tradeable.useNpcConfirm' : 'tradeable.useConfirm')}
          </Button>
          <Button variant="secondary" block onClick={onCancel}>
            {t('tradeable.useCancel')}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
