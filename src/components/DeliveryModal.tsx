import { useEffect, useState } from 'react';
import { fmtNum, t } from '../locales';
import Assets from '../assets.json';
import { SaveData } from '../game/engine';
import { canAffordOffer, deliveryGold, deliveryRarity, offerCount, rerollsLeft } from '../game/deliveries';
import { DeliveryOffer } from '../game/deliveryState';
import { getExpedition } from '../game/expedition';
import { ConsumableId, EXPEDITION_TICKET_SKIP_MS, getConsumable } from '../game/consumables';
import { getMaterial, MaterialDef, MaterialId } from '../game/materials';
import ConsumableIcon from './ConsumableIcon';
import StashHint from './StashHint';
import { Button, Chip, Meter, ModalShell, Panel, ScreenLayout } from './ui';

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

// What an order pays: the gold and (when there are any) the Éter.
function Rewards({ gold, shards }: { gold: number; shards: number }) {
  return (
    <div className="ord-rewards">
      <span className="ord-reward">
        <img className="inline-icon" src={Assets.icons.gold.url} alt="" />
        {t('ui.goldReward', { n: fmtNum(gold) })}
      </span>
      {shards > 0 && (
        <span className="ord-reward shards">
          <img className="inline-icon" src="/assets/icons/shards.png" alt="" />
          {t('ui.shardsReward', { n: shards })}
        </span>
      )}
    </div>
  );
}

// Some material icons are large remote images that take seconds to arrive on a cold visit. Until the image is really there (and
// if it never arrives) the catalog emoji fills the same box, so a requirement row never shows an empty square.
function RequirementIcon({ item }: { item: MaterialDef }) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  return (
    <span className="fg-req-icon ord-req-icon" aria-hidden>
      {(!loaded || broken || !item.iconUrl) && <span className="mat-icon-emoji">{item.icon}</span>}
      {item.iconUrl && !broken && <img className={loaded ? 'ready' : ''} src={item.iconUrl} alt="" draggable={false} onLoad={() => setLoaded(true)} onError={() => setBroken(true)} />}
    </span>
  );
}

function Requirements({ offer, save }: { offer: DeliveryOffer; save: SaveData }) {
  return (
    <div className="ord-block">
      <span className="ord-label">{dText('requires')}</span>
      <div className="fg-reqs" role="list">
        {(Object.entries(offer.items) as [MaterialId, number][]).map(([id, need]) => {
          const def = getMaterial(id);
          const have = save.materials[id] ?? 0;
          return (
            <div className="fg-req" role="listitem" key={id}>
              {def && <RequirementIcon item={def} />}
              <span className="fg-req-label">{def ? t(`materials.${def.nameKey}`) : id}</span>
              <span className={`fg-req-qty${have < need ? ' missing' : ''}`}>
                {fmtNum(Math.min(have, 99999))} / {fmtNum(need)}
              </span>
              <StashHint kind="material" id={id} need={need} />
            </div>
          );
        })}
      </div>
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
    <div className="ord-tickets">
      {ownedTickets.map((id) => {
        const def = getConsumable(id);
        if (!def) return null;
        return (
          <Button key={id} size="sm" onClick={() => onUse(id)} icon={<ConsumableIcon item={def} className="inline-icon" />}>
            {t(`consumables.${def.nameKey}`)} ×{save.consumables[id]}
          </Button>
        );
      })}
    </div>
  );

  // The summary column: the delivery on the road and the old expeditions that still run.
  const side =
    active || save.expeditions.length > 0 ? (
      <>
        {active && (
          <Panel tone="gold" className="ord-active" title={dText('activeTitle')}>
            <h4 className="ord-name">{dText(`dest_${active.offer.arch}_${active.offer.dest}`)}</h4>
            <div className="ord-chips">
              <Chip tone="info">{dText('distance', { d: dText(`dist_${active.offer.dist}`) })}</Chip>
              <Chip>{dText('time', { n: formatDuration(active.offer.durationMs) })}</Chip>
            </div>
            <Rewards gold={active.offer.gold} shards={active.offer.shards} />
            {done ? (
              <Button variant="primary" block className="ord-claim blink" onClick={onClaim}>
                {dText('collect')}
              </Button>
            ) : (
              <>
                <Meter pct={progress * 100} tone="xp" label={dText('activeTitle')} />
                <span className="ord-time">{dText('inDelivery', { n: formatRemaining(remaining) })}</span>
                {ownedTickets.length > 0 && renderTickets(onUseTicket)}
              </>
            )}
          </Panel>
        )}

        {save.expeditions.length > 0 && (
          <Panel tone="inset" className="ord-legacy" title={dText('legacyTitle')}>
            <p className="ui-note">{dText('legacyNote')}</p>
            {save.expeditions.map((expedition, index) => {
              const def = getExpedition(expedition.id);
              if (!def) return null;
              const rem = expedition.endsAt - now;
              const legacyDone = rem <= 0;
              return (
                <div className="ord-legacy-row" key={index}>
                  <h4 className="ord-name">{t(`expedition.${def.nameKey}`)}</h4>
                  {legacyDone ? (
                    <Button variant="primary" block className="ord-claim blink" onClick={() => onClaimLegacy(index)}>
                      {t('expedition.collect')}
                    </Button>
                  ) : (
                    <>
                      <Meter pct={Math.max(0, Math.min(1, (def.durationMs - rem) / def.durationMs)) * 100} tone="xp" label={t(`expedition.${def.nameKey}`)} />
                      <span className="ord-time">{t('expedition.inExpedition', { n: formatRemaining(rem) })}</span>
                      {ownedTickets.length > 0 && renderTickets((id) => onUseLegacyTicket(index, id))}
                    </>
                  )}
                </div>
              );
            })}
          </Panel>
        )}
      </>
    ) : undefined;

  const main = (
    <Panel
      className="ord-board"
      title={dText('availableTitle')}
      actions={
        <Button size="sm" onClick={onReroll} disabled={left <= 0}>
          {left > 0 ? dText('reroll', { n: left }) : dText('rerollNone')}
        </Button>
      }
    >
      <p className="ui-note ord-note">{active ? dText('busy') : dText('note')}</p>
      <div className="ord-grid">
        {save.deliveries.offers.slice(0, offerCount(passActive)).map((offer) => {
          const affordable = canAffordOffer(save, offer);
          return (
            <article className={`ui-item ord-card rarity-${deliveryRarity(offer.dist)}`} key={offer.id}>
              <div className="ord-card-head">
                <h4 className="ui-item-name">{dText(`dest_${offer.arch}_${offer.dest}`)}</h4>
                <Chip tone="gold">{formatDuration(offer.durationMs)}</Chip>
              </div>
              <div className="ord-chips">
                <Chip>{dText(`arch_${offer.arch}`)}</Chip>
                <Chip tone="info">{dText('distance', { d: dText(`dist_${offer.dist}`) })}</Chip>
                <span className={`ord-rarity rarity-${deliveryRarity(offer.dist)}`}>{rarityLabel(offer)}</span>
              </div>
              <Requirements offer={offer} save={save} />
              <div className="ord-block">
                <span className="ord-label">{dText('receives')}</span>
                <Rewards gold={deliveryGold(offer, passActive)} shards={offer.shards} />
              </div>
              <Button variant={!!active || !affordable ? 'secondary' : 'primary'} block className="ord-accept" onClick={() => onAccept(offer.id)} disabled={!!active || !affordable}>
                {!active && !affordable ? dText('missing') : dText('accept')}
              </Button>
            </article>
          );
        })}
      </div>
    </Panel>
  );

  return (
    <ModalShell
      className="ord-modal"
      tutorialTarget="deliveries-modal"
      icon={<img className="pixel-icon" src="/assets/icons/expedition_ticket_2h.png" alt="" />}
      title={dText('title')}
      closeLabel={t('ui.close')}
      onClose={onClose}
    >
      <div className="ui-cq ord-root">
        <ScreenLayout sideFirst main={main} side={side} />
      </div>
    </ModalShell>
  );
}
