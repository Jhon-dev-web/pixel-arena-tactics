import { useEffect, useState } from 'react';
import { t } from '../locales';
import Assets from '../assets.json';
import { SaveData } from '../game/engine';
import { canAffordOffer, deliveryRarity, deliveryXp, offerCount, rerollsLeft } from '../game/deliveries';
import { DeliveryOffer } from '../game/deliveryState';
import { getExpedition } from '../game/expedition';
import { ConsumableId, EXPEDITION_TICKET_SKIP_MS, getConsumable } from '../game/consumables';
import { getMaterial, MaterialDef, MaterialId } from '../game/materials';
import ConsumableIcon from './ConsumableIcon';

const TICKET_IDS = Object.keys(EXPEDITION_TICKET_SKIP_MS) as ConsumableId[];
const dText = (k: string, v?: Record<string, string | number>): string => t(`deliveries.${k}`, v);

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

const compact = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

function Rewards({ gold, xp, shards }: { gold: number; xp: number; shards: number }) {
  return (
    <div className="expedition-option-rewards">
      <span className="floor-drop">
        <span className="mat-icon">
          <img src={Assets.icons.gold.url} alt="" />
        </span>
        <span>{t('ui.goldReward', { n: gold })}</span>
      </span>
      <span className="floor-drop delivery-xp">{dText('xp', { n: compact(xp) })}</span>
      {shards > 0 && (
        <span className="floor-drop">
          <span className="mat-icon shard">
            <img src="/assets/icons/shards.png" alt="" />
          </span>
          <span>{t('ui.shardsReward', { n: shards })}</span>
        </span>
      )}
    </div>
  );
}

// Some material icons are large remote images that take seconds to arrive on a cold visit. Until the image is really there (and
// if it never arrives) the catalog emoji fills the same 18px box, so a requirement row never shows an empty square.
function RequirementIcon({ item }: { item: MaterialDef }) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  return (
    <span className="delivery-req-icon">
      {(!loaded || broken || !item.iconUrl) && <span className="mat-icon-emoji">{item.icon}</span>}
      {item.iconUrl && !broken && <img className={loaded ? 'ready' : ''} src={item.iconUrl} alt="" draggable={false} onLoad={() => setLoaded(true)} onError={() => setBroken(true)} />}
    </span>
  );
}

function Requirements({ offer, save }: { offer: DeliveryOffer; save: SaveData }) {
  return (
    <div className="delivery-req">
      <span className="delivery-label">{dText('requires')}</span>
      {(Object.entries(offer.items) as [MaterialId, number][]).map(([id, need]) => {
        const def = getMaterial(id);
        const have = save.materials[id] ?? 0;
        return (
          <div className={`delivery-req-row${have < need ? ' short' : ''}`} key={id}>
            <span className="delivery-req-name">
              {def && <RequirementIcon item={def} />}
              <span>{def ? t(`materials.${def.nameKey}`) : id}</span>
            </span>
            <span className="delivery-req-qty">
              {Math.min(have, 99999)} / {need}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function DeliveryModal({
  save,
  passActive,
  onAccept,
  onClaim,
  onReroll,
  onUseTicket,
  onClaimLegacy,
  onUseLegacyTicket,
  onClose,
}: {
  save: SaveData;
  passActive: boolean;
  onAccept: (offerId: string) => void;
  onClaim: () => void;
  onReroll: () => void;
  onUseTicket: (ticketId: ConsumableId) => void;
  onClaimLegacy: (index: number) => void;
  onUseLegacyTicket: (index: number, ticketId: ConsumableId) => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const active = save.deliveries.active;
  const ticking = !!active || save.expeditions.length > 0;
  useEffect(() => {
    if (!ticking) return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [ticking]);

  const ownedTickets = TICKET_IDS.filter((id) => (save.consumables[id] ?? 0) > 0);
  const left = rerollsLeft(save.deliveries, now, passActive);
  const rarityLabel = (o: DeliveryOffer) => dText(`rarity_${deliveryRarity(o.dist)}`);

  const remaining = active ? active.endsAt - now : 0;
  const done = !!active && remaining <= 0;
  const progress = active ? (done ? 1 : Math.max(0, Math.min(1, (active.offer.durationMs - remaining) / active.offer.durationMs))) : 0;

  const renderTickets = (onUse: (id: ConsumableId) => void) => (
    <div className="expedition-tickets">
      {ownedTickets.map((id) => {
        const def = getConsumable(id);
        if (!def) return null;
        return (
          <button className="expedition-ticket-btn" key={id} onClick={() => onUse(id)} data-ui>
            <ConsumableIcon item={def} className="inline-icon" /> {t(`consumables.${def.nameKey}`)} ×{save.consumables[id]}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="modal-backdrop">
      <div className="modal expedition-modal delivery-modal" data-tutorial-target="deliveries-modal">
        <h2 className="modal-title">{dText('title')}</h2>

        {active && (
          <div className="expedition-active-card delivery-active">
            <span className="delivery-label">{dText('activeTitle')}</span>
            <div className="camp-expedition-name">{dText(`dest_${active.offer.arch}_${active.offer.dest}`)}</div>
            <div className="delivery-meta">
              {dText('distance', { d: dText(`dist_${active.offer.dist}`) })} · {dText('time', { n: formatDuration(active.offer.durationMs) })}
            </div>
            <Rewards gold={active.offer.gold} xp={active.offer.xp} shards={active.offer.shards} />
            {done ? (
              <button className="camp-expedition-claim blink" onClick={onClaim} data-ui>
                {dText('collect')}
              </button>
            ) : (
              <>
                <div className="camp-expedition-bar">
                  <div className="camp-expedition-fill" style={{ width: `${progress * 100}%` }} />
                </div>
                <span className="camp-expedition-time">{dText('inDelivery', { n: formatRemaining(remaining) })}</span>
                {ownedTickets.length > 0 && renderTickets(onUseTicket)}
              </>
            )}
          </div>
        )}

        {save.expeditions.length > 0 && (
          <div className="delivery-legacy">
            <span className="delivery-label">{dText('legacyTitle')}</span>
            <p className="expedition-note">{dText('legacyNote')}</p>
            {save.expeditions.map((expedition, index) => {
              const def = getExpedition(expedition.id);
              if (!def) return null;
              const rem = expedition.endsAt - now;
              const legacyDone = rem <= 0;
              return (
                <div className="expedition-active-card" key={index}>
                  <div className="camp-expedition-name">{t(`expedition.${def.nameKey}`)}</div>
                  {legacyDone ? (
                    <button className="camp-expedition-claim blink" onClick={() => onClaimLegacy(index)} data-ui>
                      {t('expedition.collect')}
                    </button>
                  ) : (
                    <>
                      <div className="camp-expedition-bar">
                        <div className="camp-expedition-fill" style={{ width: `${Math.max(0, Math.min(1, (def.durationMs - rem) / def.durationMs)) * 100}%` }} />
                      </div>
                      <span className="camp-expedition-time">{t('expedition.inExpedition', { n: formatRemaining(rem) })}</span>
                      {ownedTickets.length > 0 && renderTickets((id) => onUseLegacyTicket(index, id))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="delivery-board-head">
          <span className="delivery-label">{dText('availableTitle')}</span>
          <button className="delivery-reroll" onClick={onReroll} disabled={left <= 0} data-ui>
            {left > 0 ? dText('reroll', { n: left }) : dText('rerollNone')}
          </button>
        </div>
        {active ? <p className="expedition-note">{dText('busy')}</p> : <p className="expedition-note">{dText('note')}</p>}

        <div className="expedition-list">
          {save.deliveries.offers.slice(0, offerCount(passActive)).map((offer) => {
            const affordable = canAffordOffer(save, offer);
            return (
              <div className={`expedition-option delivery-offer rarity-${deliveryRarity(offer.dist)}`} key={offer.id}>
                <div className="expedition-option-head">
                  <span className="expedition-option-name">{dText(`dest_${offer.arch}_${offer.dest}`)}</span>
                  <span className="expedition-option-dur">{formatDuration(offer.durationMs)}</span>
                </div>
                <div className="delivery-meta">
                  {dText(`arch_${offer.arch}`)} · {dText('distance', { d: dText(`dist_${offer.dist}`) })} · {rarityLabel(offer)}
                </div>
                <Requirements offer={offer} save={save} />
                <span className="delivery-label">{dText('receives')}</span>
                <Rewards gold={offer.gold} xp={deliveryXp(offer, passActive)} shards={offer.shards} />
                <button className="battle-btn" onClick={() => onAccept(offer.id)} disabled={!!active || !affordable} data-ui>
                  {!active && !affordable ? dText('missing') : dText('accept')}
                </button>
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
