import { useState } from 'react';
import { fmtNum, t } from '../locales';
import { SaveData } from '../game/engine';
import { POUCH_IDS, PouchFailure, PouchId, applyCreatePouch, paysPassFee, pouchCost, pouchFace, pouchFee, pouchPerDay, pouchRuleParams, pouchesMadeToday } from '../game/goldPouch';
import { useCertificatesVersion, verifiedPouchCount } from '../game/itemCerts';
import { getConsumable } from '../game/consumables';
import ConsumableIcon from './ConsumableIcon';
import PouchOpenButton from './PouchOpenButton';

// The Bolsa de Ouro tab of the shop (goldPouch.ts): the rules in words (every number read from the same tunables as the code), one row per denomination with the fee and the
// total, and the pouches the hero holds with an Open button. A player without the Pass sees the lower Pass fee.

const FAIL_KEY: Record<PouchFailure, string> = { limit: 'pouch.failLimit', gold: 'pouch.failGold', bag: 'pouch.failBag', none: 'pouch.failGold', certified: 'pouch.failGold' };

// Why a pouch cannot be made right now (the same checks as applyCreatePouch, which is the one that decides), or null.
function whyNot(save: SaveData, id: PouchId, now: number): PouchFailure | null {
  const r = applyCreatePouch(save, id, now);
  return r.ok ? null : (r.reason ?? 'none');
}

export default function PouchPanel({ save, onCreate, onOpen }: { save: SaveData; onCreate: (id: PouchId) => void; onOpen: (id: PouchId) => void }) {
  useCertificatesVersion(); // the server's list of certificates changed
  const now = Date.now();
  const [lastFail, setLastFail] = useState<PouchFailure | null>(null);
  const owner = paysPassFee(save);
  const rules = pouchRuleParams();
  const held = POUCH_IDS.filter((id) => (save.consumables?.[id] ?? 0) > 0);

  return (
    <div className="shop-body pouch-body">
      <div className="merchant-budget">
        <span className="stash-note">{t('pouch.explain', { min: fmtNum(rules.min), fee: rules.fee, free: rules.free, n: rules.n })}</span>
        <span className="stash-note">{t('pouch.openExplain')}</span>
        {!owner && <span className="stash-note pouch-need">{t('pouch.passFee', { fee: rules.fee, free: rules.free })}</span>}
        <span className="stash-note">{t('pouch.madeToday', { n: pouchesMadeToday(save, now), m: pouchPerDay() })}</span>
      </div>

      {POUCH_IDS.map((id) => {
        const def = getConsumable(id)!;
        const blocked = whyNot(save, id, now);
        return (
          <div className="gear-row" key={id}>
            <div className="gear-info">
              <span className="gear-name">
                <span className="gear-name-text">
                  <ConsumableIcon item={def} className="inline-icon" /> {t(`consumables.${def.nameKey}`)}
                </span>
                <span className="gear-count">{t('shop.youHave', { n: save.consumables?.[id] ?? 0 })}</span>
              </span>
              <span className="gear-desc">{t('pouch.face', { v: fmtNum(pouchFace(id)) })}</span>
              <span className="gear-cost">{t('pouch.feeLine', { fee: fmtNum(pouchFee(id, owner)), total: fmtNum(pouchCost(id, owner)) })}</span>
              {blocked && <span className="craft-bag-full">{t(FAIL_KEY[blocked])}</span>}
            </div>
            <button
              className="gear-action buy"
              disabled={!!blocked}
              onClick={() => {
                setLastFail(null);
                const r = applyCreatePouch(save, id, now);
                if (!r.ok) setLastFail(r.reason ?? 'none');
                else onCreate(id);
              }}
              data-ui
            >
              {t('pouch.create')}
            </button>
          </div>
        );
      })}
      {lastFail && <p className="craft-bag-full">{t(FAIL_KEY[lastFail])}</p>}

      <div className="shop-section-title">{t('pouch.heldTitle')}</div>
      {held.length === 0 && <p className="stash-note">{t('pouch.none')}</p>}
      {held.map((id) => (
        <div className="gear-row pouch-held" key={`held:${id}`}>
          <div className="gear-info">
            <span className="gear-name">
              <span className="gear-name-text">
                <ConsumableIcon item={getConsumable(id)!} className="inline-icon" /> {t(`consumables.${getConsumable(id)!.nameKey}`)}
              </span>
              <span className="gear-count">{t('shop.youHave', { n: save.consumables?.[id] ?? 0 })}</span>
            </span>
            <span className="gear-desc">{t('pouch.worth', { g: fmtNum(pouchFace(id)) })}</span>
            <span className="gear-desc">{t('pouch.certifiedLine', { n: verifiedPouchCount(save, id), m: Math.max(0, (save.consumables?.[id] ?? 0) + (save.stash?.consumables?.[id] ?? 0) - verifiedPouchCount(save, id)) })}</span>
          </div>
          <PouchOpenButton id={id} onOpen={onOpen} />
        </div>
      ))}
    </div>
  );
}
