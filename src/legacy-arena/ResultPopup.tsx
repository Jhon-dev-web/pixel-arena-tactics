import { t } from '../locales';

export default function ResultPopup({
  phase,
  loot,
  onNext,
  onRetry,
}: {
  phase: 'victory' | 'defeat';
  loot: { gold: number; shards: number } | null;
  onNext: () => void;
  onRetry: () => void;
}) {
  if (phase === 'victory' && loot) {
    return (
      <div className="modal-backdrop">
        <div className="modal result-modal victory">
          <h2 className="modal-title win">{t('combat.victoryTitle')}</h2>
          <p className="loot-text">{t('combat.loot', { n: loot.gold })}</p>
          {loot.shards > 0 && <p className="loot-text shard">{t('combat.shardLoot', { n: loot.shards })}</p>}
          <button className="result-btn" onClick={onNext} data-ui>
            {t('ui.nextDuel')}
          </button>
        </div>
      </div>
    );
  }
  if (phase === 'defeat') {
    return (
      <div className="modal-backdrop">
        <div className="modal result-modal defeat">
          <h2 className="modal-title lose">{t('combat.defeatTitle')}</h2>
          <p className="loot-text">{t('combat.defeatHint')}</p>
          <button className="result-btn" onClick={onRetry} data-ui>
            {t('ui.retry')}
          </button>
        </div>
      </div>
    );
  }
  return null;
}
