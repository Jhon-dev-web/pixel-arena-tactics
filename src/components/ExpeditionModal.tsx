import { useEffect, useState } from 'react';
import { t } from '../locales';
import Assets from '../assets.json';
import { SaveData } from '../game/engine';
import { EXPEDITIONS, getExpedition } from '../game/expedition';
import { ConsumableId, EXPEDITION_TICKET_SKIP_MS, getConsumable } from '../game/consumables';
import ConsumableIcon from './ConsumableIcon';

const expText = (k: string): string => t(`expedition.${k}`);

const TICKET_IDS = Object.keys(EXPEDITION_TICKET_SKIP_MS) as ConsumableId[];

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function ExpeditionModal({
  save,
  maxSlots,
  huntingActive,
  onStart,
  onCancel,
  onClaim,
  onUseTicket,
  onClose,
}: {
  save: SaveData;
  maxSlots: number;
  huntingActive: boolean;
  onStart: (id: string) => void;
  onCancel: (index: number) => void;
  onClaim: (index: number) => void;
  onUseTicket: (index: number, ticketId: ConsumableId) => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (save.expeditions.length === 0) return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [save.expeditions.length]);

  const hasFreeSlot = save.expeditions.length < maxSlots;

  return (
    <div className="modal-backdrop">
      <div className="modal expedition-modal">
        <h2 className="modal-title">{t('expedition.title')}</h2>
        <p className="expedition-slots">{t('expedition.slots', { n: save.expeditions.length, m: maxSlots })}</p>

        {save.expeditions.map((expedition, index) => {
          const activeDef = getExpedition(expedition.id);
          if (!activeDef) return null;
          const remaining = expedition.endsAt - now;
          const done = remaining <= 0;
          const progress = done ? 1 : Math.max(0, Math.min(1, (activeDef.durationMs - remaining) / activeDef.durationMs));
          const ownedTickets = TICKET_IDS.filter((id) => (save.consumables[id] ?? 0) > 0);
          return (
            <div className="expedition-active-card" key={index}>
              <div className="camp-expedition-name">{expText(activeDef.nameKey)}</div>
              {done ? (
                <button className="camp-expedition-claim blink" onClick={() => onClaim(index)} data-ui>
                  {t('expedition.collect')}
                </button>
              ) : (
                <>
                  <div className="camp-expedition-bar">
                    <div className="camp-expedition-fill" style={{ width: `${progress * 100}%` }} />
                  </div>
                  <span className="camp-expedition-time">{t('expedition.inExpedition', { n: formatRemaining(remaining) })}</span>
                  {ownedTickets.length > 0 && (
                    <div className="expedition-tickets">
                      {ownedTickets.map((id) => {
                        const def = getConsumable(id);
                        if (!def) return null;
                        return (
                          <button className="expedition-ticket-btn" key={id} onClick={() => onUseTicket(index, id)} data-ui>
                            <ConsumableIcon item={def} className="inline-icon" /> {t(`consumables.${def.nameKey}`)} ×{save.consumables[id]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <button className="camp-expedition-cancel" onClick={() => onCancel(index)} data-ui>
                    {t('expedition.cancel')}
                  </button>
                </>
              )}
            </div>
          );
        })}

        {hasFreeSlot && (
          <>
            <p className="expedition-note">{t('expedition.background')}</p>
            {huntingActive && <div className="cp-warning-banner">{t('hunting.busyOther')}</div>}
            <div className="expedition-list">
              {EXPEDITIONS.map((def) => (
                <div className="expedition-option" key={def.id}>
                  <div className="expedition-option-head">
                    <span className="expedition-option-name">{expText(def.nameKey)}</span>
                    <span className="expedition-option-dur">{expText(def.durationKey)}</span>
                  </div>
                  <p className="expedition-option-desc">{expText(def.descKey)}</p>
                  <div className="expedition-option-rewards">
                    <span className="floor-drop">
                      <span className="mat-icon">
                        <img src={Assets.icons.gold.url} alt="" />
                      </span>
                      <span>{t('ui.goldReward', { n: def.gold })}</span>
                    </span>
                    <span className="floor-drop">
                      <span className="mat-icon xp">XP</span>
                      <span>{t('ui.xpReward', { n: def.xp })}</span>
                    </span>
                    {def.shards > 0 && (
                      <span className="floor-drop">
                        <span className="mat-icon shard">
                          <img src="/assets/icons/shards.png" alt="" />
                        </span>
                        <span>{t('ui.shardsX', { n: def.shards })}</span>
                      </span>
                    )}
                  </div>
                  <button className="battle-btn" onClick={() => onStart(def.id)} disabled={huntingActive} data-ui>
                    {t('expedition.start')}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
