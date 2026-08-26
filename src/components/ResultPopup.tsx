import Text from '../locales/en.json';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));

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
          <h2 className="modal-title win">{Text.combat.victoryTitle}</h2>
          <p className="loot-text">{fmt(Text.combat.loot, loot.gold)}</p>
          {loot.shards > 0 && <p className="loot-text shard">{fmt(Text.combat.shardLoot, loot.shards)}</p>}
          <button className="result-btn" onClick={onNext} data-ui>
            {Text.ui.nextDuel}
          </button>
        </div>
      </div>
    );
  }
  if (phase === 'defeat') {
    return (
      <div className="modal-backdrop">
        <div className="modal result-modal defeat">
          <h2 className="modal-title lose">{Text.combat.defeatTitle}</h2>
          <p className="loot-text">{Text.combat.defeatHint}</p>
          <button className="result-btn" onClick={onRetry} data-ui>
            {Text.ui.retry}
          </button>
        </div>
      </div>
    );
  }
  return null;
}
