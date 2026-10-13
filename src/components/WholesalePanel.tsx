import { useState } from 'react';
import { fmtNum, fmtPrice, t } from '../locales';
import { SaveData } from '../game/engine';
import { MATERIALS, MaterialDef, MaterialId } from '../game/materials';
import { merchantPrice } from '../game/merchant';
import { WholesaleLine, isRareMaterial, wholesaleMultiplier, wholesalePlan, wholesaleQuote, wholesaleSoldToday, wholesaleUnitPrice, wholesaleUnlockFloor, wholesaleUnlocked } from '../game/wholesale';
import T from '../game/tunables';
import MaterialIcon from './MaterialIcon';

// The Mercador Atacadista tab of the shop (wholesale.ts). EVERYTHING here is manual: a stack is sold with its own quantity selector, or several are ticked and sold together after
// a confirmation that lists what goes and what it pays; a rare material asks a second time. Nothing is ever sold without a button the player pressed.

type Mode = 1 | 10 | 'all' | 'custom';
const MODES: Mode[] = [1, 10, 'all', 'custom'];

const matName = (def: MaterialDef): string => t(`materials.${def.nameKey}`);
interface Confirm {
  lines: WholesaleLine[];
  step: 'list' | 'rare';
}

export default function WholesalePanel({ save, onSell }: { save: SaveData; onSell: (lines: WholesaleLine[]) => void }) {
  const now = Date.now();
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [armed, setArmed] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  if (!wholesaleUnlocked(save)) {
    return (
      <div className="shop-body ws-locked">
        <p className="ws-lock-title">🔒 {t('wholesale.title')}</p>
        <p className="stash-note">{t('wholesale.locked', { n: wholesaleUnlockFloor() })}</p>
        <p className="stash-note">{t('wholesale.explain', { rate: Math.round(T.wholesale.priceRate * 100) })}</p>
      </div>
    );
  }

  const rows = MATERIALS.map((def) => ({ def, qty: save.materials?.[def.id] ?? 0 })).filter((r) => r.qty > 0 && merchantPrice('material', r.def.id) > 0);
  const modeOf = (id: string): Mode => modes[id] ?? 'all';
  const unitsOf = (id: MaterialId, qty: number): number => {
    const m = modeOf(id);
    if (m === 'all') return qty;
    if (m === 'custom') return Math.max(0, Math.min(qty, Math.floor(Number(custom[id] ?? '')) || 0));
    return Math.min(qty, m);
  };
  const lineFor = (id: MaterialId, qty: number): WholesaleLine => ({ id, qty: modeOf(id) === 'all' ? 'all' : unitsOf(id, qty) });
  const tickedLines: WholesaleLine[] = rows.filter((r) => ticked[r.def.id]).map((r) => lineFor(r.def.id, r.qty));
  const tickedPlan = wholesalePlan(save, tickedLines, now);

  const askSell = (lines: WholesaleLine[]) => {
    const plan = wholesalePlan(save, lines, now);
    if (plan.lines.length === 0) return;
    setConfirm({ lines, step: 'list' });
  };
  const finish = (lines: WholesaleLine[]) => {
    onSell(lines);
    setConfirm(null);
    setArmed(null);
    setTicked({});
  };
  const proceed = () => {
    if (!confirm) return;
    const plan = wholesalePlan(save, confirm.lines, now);
    if (plan.hasRare && confirm.step === 'list') setConfirm({ ...confirm, step: 'rare' });
    else finish(confirm.lines);
  };

  const confirmPlan = confirm ? wholesalePlan(save, confirm.lines, now) : null;
  const nameOf = (id: MaterialId): string => matName(MATERIALS.find((m) => m.id === id)!);

  return (
    <div className="shop-body shop-sell ws-body">
      <div className="merchant-budget">
        <span className="stash-note">{t('wholesale.explain', { rate: Math.round(T.wholesale.priceRate * 100) })}</span>
        <span className="stash-note">
          {t('wholesale.curve', { n: fmtNum(T.wholesale.freeUnits), b: fmtNum(T.wholesale.blockUnits), d: Math.round(T.wholesale.blockDrop * 100), f: Math.round(T.wholesale.floorRate * 100) })}
        </span>
        <span className="stash-note">{t('wholesale.fromBag')}</span>
      </div>
      {rows.length === 0 && <p className="stash-note">{t('wholesale.nothing')}</p>}
      {rows.map(({ def, qty }) => {
        const id = def.id;
        const units = unitsOf(id, qty);
        const q = wholesaleQuote(save, id, modeOf(id) === 'all' ? 'all' : units, now);
        const rare = isRareMaterial(id);
        const sold = wholesaleSoldToday(save, id, now);
        const next = wholesaleUnitPrice(id) * wholesaleMultiplier(sold);
        const whole = q.units >= qty;
        const key = `ws:${id}`;
        return (
          <div className={`gear-row ws-row${ticked[id] ? ' ticked' : ''}`} key={id}>
            <div className="gear-info">
              <span className="gear-name">
                <label className="ws-tick" title={t('wholesale.tick')}>
                  <input type="checkbox" checked={!!ticked[id]} onChange={(e) => setTicked({ ...ticked, [id]: e.target.checked })} data-ui />
                </label>
                <span className="gear-name-text">
                  <MaterialIcon item={def} className="inline-icon" /> {matName(def)}
                  {rare && <span className="ws-rare-tag">★</span>}
                </span>
                <span className="gear-count">{t('shop.youHave', { n: fmtNum(qty) })}</span>
              </span>
              <span className="gear-cost ws-price">
                {t('wholesale.priceEach', { n: fmtPrice(wholesaleUnitPrice(id)), m: fmtNum(merchantPrice('material', id)) })}
                {sold > 0 && ` · ${t('wholesale.nextPrice', { n: fmtPrice(next) })} · ${t('wholesale.soldToday', { n: fmtNum(sold) })}`}
              </span>
            </div>
            <div className="ws-controls">
              <div className="qty-picker" role="radiogroup" aria-label={t('inventory.qtyLabel')}>
                {MODES.map((m) => (
                  <button
                    key={String(m)}
                    className={`qty-btn${modeOf(id) === m ? ' active' : ''}`}
                    onClick={() => {
                      setModes({ ...modes, [id]: m });
                      setArmed(null);
                    }}
                    aria-pressed={modeOf(id) === m}
                    data-ui
                  >
                    {m === 'all' ? t('inventory.qtyAll') : m === 'custom' ? t('wholesale.custom') : String(m)}
                  </button>
                ))}
                {modeOf(id) === 'custom' && (
                  <input
                    className="ws-custom"
                    type="number"
                    min={1}
                    max={qty}
                    inputMode="numeric"
                    aria-label={t('wholesale.customLabel')}
                    value={custom[id] ?? ''}
                    onChange={(e) => {
                      setCustom({ ...custom, [id]: e.target.value });
                      setArmed(null);
                    }}
                  />
                )}
              </div>
              <button
                className={`gear-action sell${armed === key ? ' confirm' : ''}`}
                disabled={q.units <= 0 || q.gold <= 0}
                title={q.units > 0 && q.gold <= 0 ? t('wholesale.paysNothing') : undefined}
                onClick={() => {
                  const line = lineFor(id, qty);
                  if (rare) {
                    setConfirm({ lines: [line], step: 'rare' });
                    return;
                  }
                  if (whole && armed !== key) {
                    setArmed(key);
                    return;
                  }
                  finish([line]);
                }}
                data-ui
              >
                {armed === key ? t('merchant.confirmShort') : q.units > 0 && q.gold <= 0 ? t('wholesale.paysNothing') : t('wholesale.sell', { n: fmtNum(q.units), g: fmtNum(q.gold) })}
              </button>
            </div>
          </div>
        );
      })}

      {rows.length > 0 && (
        <div className="ws-batch">
          <span className="stash-note">{t('wholesale.selectedHint', { n: tickedLines.length, u: fmtNum(tickedPlan.units) })}</span>
          <button className="inv-sell" disabled={tickedPlan.lines.length === 0} onClick={() => askSell(tickedLines)} data-ui>
            {t('wholesale.sellSelected', { n: tickedPlan.lines.length })}
          </button>
        </div>
      )}

      {confirm && confirmPlan && (
        <div className="modal-backdrop ws-confirm-backdrop">
          <div className="modal ws-confirm" role="dialog" aria-label={t('wholesale.confirmTitle')}>
            {confirm.step === 'list' ? (
              <>
                <h3 className="modal-title">{t('wholesale.confirmTitle')}</h3>
                <ul className="ws-confirm-list">
                  {confirmPlan.lines.map((l) => (
                    <li key={l.id}>{t('wholesale.confirmLine', { name: nameOf(l.id), n: fmtNum(l.units), g: fmtNum(l.gold) })}</li>
                  ))}
                </ul>
                <p className="ws-confirm-total">{t('wholesale.confirmTotal', { n: fmtNum(confirmPlan.units), g: fmtNum(confirmPlan.gold) })}</p>
              </>
            ) : (
              <>
                <h3 className="modal-title ws-rare-title">★ {t('wholesale.rareTitle')}</h3>
                <p className="ws-confirm-total">{t('wholesale.rareWarn')}</p>
                <p className="stash-note">{t('wholesale.rareList', { names: confirmPlan.lines.filter((l) => l.rare).map((l) => nameOf(l.id)).join(', ') })}</p>
                <p className="stash-note">{t('wholesale.confirmTotal', { n: fmtNum(confirmPlan.units), g: fmtNum(confirmPlan.gold) })}</p>
              </>
            )}
            <div className="ws-confirm-actions">
              <button className="inv-store" onClick={() => setConfirm(null)} data-ui>
                {t('wholesale.cancel')}
              </button>
              <button className="inv-sell confirm" onClick={proceed} data-ui>
                {confirm.step === 'rare' ? t('wholesale.rareYes') : t('wholesale.confirmYes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
