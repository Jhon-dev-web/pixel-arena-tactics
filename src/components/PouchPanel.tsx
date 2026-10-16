import { useState } from 'react';
import { fmtNum, t } from '../locales';
import { SaveData } from '../game/engine';
import { POUCH_IDS, PouchFailure, PouchId, applyCreatePouch, paysPassFee, pouchCost, pouchFace, pouchFee, pouchPerDay, pouchRuleParams, pouchesMadeToday } from '../game/goldPouch';
import { useCertificatesVersion, verifiedPouchCount } from '../game/itemCerts';
import { getConsumable } from '../game/consumables';
import ConsumableIcon from './ConsumableIcon';
import PouchOpenButton from './PouchOpenButton';
import { Button, ItemCard, Panel } from './ui';

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
    <>
      <Panel tone="inset" className="pouch-rules">
        <span className="ui-note">{t('pouch.explain', { min: fmtNum(rules.min), fee: rules.fee, free: rules.free, n: rules.n })}</span>
        <span className="ui-note">{t('pouch.openExplain')}</span>
        {!owner && <span className="ui-note pouch-need">{t('pouch.passFee', { fee: rules.fee, free: rules.free })}</span>}
        <span className="ui-note">{t('pouch.madeToday', { n: pouchesMadeToday(save, now), m: pouchPerDay() })}</span>
      </Panel>

      <div className="ui-grid shop-grid">
        {POUCH_IDS.map((id) => {
          const def = getConsumable(id)!;
          const blocked = whyNot(save, id, now);
          const have = save.consumables?.[id] ?? 0;
          return (
            <ItemCard
              key={id}
              icon={<ConsumableIcon item={def} className="pixel-icon" />}
              qty={have > 0 ? fmtNum(have) : undefined}
              name={t(`consumables.${def.nameKey}`)}
              tag={<span className="shop-have">{t('shop.youHave', { n: have })}</span>}
              action={
                <Button
                  block
                  variant="primary"
                  disabled={!!blocked}
                  onClick={() => {
                    setLastFail(null);
                    const r = applyCreatePouch(save, id, now);
                    if (!r.ok) setLastFail(r.reason ?? 'none');
                    else onCreate(id);
                  }}
                >
                  {t('pouch.create')}
                </Button>
              }
            >
              <p className="shop-face">{t('pouch.face', { v: fmtNum(pouchFace(id)) })}</p>
              <p className="shop-each">{t('pouch.feeLine', { fee: fmtNum(pouchFee(id, owner)), total: fmtNum(pouchCost(id, owner)) })}</p>
              {blocked && <span className="craft-bag-full">{t(FAIL_KEY[blocked])}</span>}
            </ItemCard>
          );
        })}
      </div>
      {lastFail && <p className="ui-alert bad">{t(FAIL_KEY[lastFail])}</p>}

      <Panel title={t('pouch.heldTitle')}>
        {held.length === 0 && <p className="ui-note">{t('pouch.none')}</p>}
        <div className="ui-grid shop-grid">
          {held.map((id) => {
            const def = getConsumable(id)!;
            const have = save.consumables?.[id] ?? 0;
            return (
              <ItemCard
                key={`held:${id}`}
                className="pouch-held"
                icon={<ConsumableIcon item={def} className="pixel-icon" />}
                qty={fmtNum(have)}
                name={t(`consumables.${def.nameKey}`)}
                tag={<span className="shop-have">{t('shop.youHave', { n: have })}</span>}
                action={<PouchOpenButton id={id} onOpen={onOpen} />}
              >
                <p className="shop-each">{t('pouch.worth', { g: fmtNum(pouchFace(id)) })}</p>
                <p className="shop-each">{t('pouch.certifiedLine', { n: verifiedPouchCount(save, id), m: Math.max(0, have + (save.stash?.consumables?.[id] ?? 0) - verifiedPouchCount(save, id)) })}</p>
              </ItemCard>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
