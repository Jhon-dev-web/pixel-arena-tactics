import { useState } from 'react';
import { t } from '../locales';
import { SaveData, computeCP } from '../game/engine';
import { QUESTS_DAILY, QUESTS_ACHIEVEMENTS, QuestDef, QuestContext, isClaimed, isComplete, questProgress } from '../game/quests';

const questText = (k: string): string => t(`quests.${k}`);

export default function QuestsModal({
  save,
  onClaim,
  onClose,
}: {
  save: SaveData;
  onClaim: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'daily' | 'achievements'>('daily');
  const maxRefine = Math.max(0, ...Object.values(save.upgrades ?? {}));
  const ctx: QuestContext = { cp: computeCP(save), maxRefine };
  const list = tab === 'daily' ? QUESTS_DAILY : QUESTS_ACHIEVEMENTS;

  return (
    <div className="modal-backdrop">
      <div className="modal quests-modal">
        <h2 className="modal-title">{t('quests.title')}</h2>

        <div className="inv-tabs">
          <button className={`tab${tab === 'daily' ? ' active' : ''}`} onClick={() => setTab('daily')} data-ui>
            {t('quests.dailyTab')}
          </button>
          <button className={`tab${tab === 'achievements' ? ' active' : ''}`} onClick={() => setTab('achievements')} data-ui>
            {t('quests.achievementsTab')}
          </button>
        </div>

        <div className="quests-body">
          {list.map((q: QuestDef) => {
            const claimed = isClaimed(q, save.quests);
            const progress = Math.min(q.target, questProgress(q, save.quests, ctx));
            const complete = isComplete(q, save.quests, ctx);
            const pct = q.target <= 0 ? 100 : Math.min(100, (progress / q.target) * 100);
            return (
              <div className={`quest-card${claimed ? ' claimed' : ''}`} key={q.id}>
                <div className="quest-head">
                  <span className="quest-name">{questText(q.nameKey)}</span>
                  <span className="quest-reward">
                    🪙 {q.gold}
                    {q.shards > 0 && (
                      <span className="quest-shards">
                        {' '}
                        <img className="inline-icon" src="/assets/icons/shards.png" alt="" /> {q.shards}
                      </span>
                    )}
                  </span>
                </div>
                <span className="quest-desc">{questText(q.descKey)}</span>
                <div className="quest-progress-row">
                  <div className="quest-bar">
                    <div className={`quest-bar-fill${complete ? ' done' : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="quest-count">{t('quests.progress', { n: progress, m: q.target })}</span>
                </div>
                {claimed ? (
                  <button className="quest-btn claimed" disabled data-ui>
                    {t('quests.claimed')}
                  </button>
                ) : (
                  <button className={`quest-btn${complete ? ' claim' : ''}`} onClick={() => onClaim(q.id)} disabled={!complete} data-ui>
                    {t('quests.claim')}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
