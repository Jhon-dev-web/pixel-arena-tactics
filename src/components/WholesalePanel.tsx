import PixelIcon from './PixelIcon';
import { useState } from 'react';
import { fmtNum, fmtPrice, t } from '../locales';
import { SaveData } from '../game/engine';
import { MATERIALS, MaterialDef, MaterialId } from '../game/materials';
import { merchantPrice } from '../game/merchant';
import { WholesaleLine, isRareMaterial, wholesaleMultiplier, wholesalePlan, wholesaleQuote, wholesaleSoldToday, wholesaleUnitPrice, wholesaleUnlockFloor, wholesaleUnlocked } from '../game/wholesale';
import T from '../game/tunables';
import MaterialIcon from './MaterialIcon';
import { Button, ChipRow, Dialog, ItemCard, Panel } from './ui';

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
      <Panel tone="inset" className="ws-locked" title={<><PixelIcon name="lock" className="sm" /> {t('wholesale.title')}</>}>
        <p className="ui-note">{t('wholesale.locked', { n: wholesaleUnlockFloor() })}</p>
        <p className="ui-note">{t('wholesale.explain', { rate: Math.round(T.wholesale.priceRate * 100) })}</p>
      </Panel>
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
    <>
      <Panel tone="inset" className="ws-intro">
        <span className="ui-note">{t('wholesale.explain', { rate: Math.round(T.wholesale.priceRate * 100) })}</span>
        <span className="ui-note">
          {t('wholesale.curve', { n: fmtNum(T.wholesale.freeUnits), b: fmtNum(T.wholesale.blockUnits), d: Math.round(T.wholesale.blockDrop * 100), f: Math.round(T.wholesale.floorRate * 100) })}
        </span>
        <span className="ui-note">{t('wholesale.fromBag')}</span>
      </Panel>
      {rows.length === 0 && <p className="ui-note">{t('wholesale.nothing')}</p>}
      <div className="ui-grid shop-grid ws-grid">
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
            <ItemCard
              key={id}
              className={`ws-row${ticked[id] ? ' ticked' : ''}`}
              selected={!!ticked[id]}
              icon={<MaterialIcon item={def} className="pixel-icon" />}
              rarity={rare ? 'legendary' : 'common'}
              qty={fmtNum(qty)}
              name={
                <>
                  {matName(def)}
                  {rare && <span className="ws-rare-tag"> ★</span>}
                </>
              }
              tag={
                <label className="ws-tick" title={t('wholesale.tick')}>
                  <input type="checkbox" checked={!!ticked[id]} onChange={(e) => setTicked({ ...ticked, [id]: e.target.checked })} data-ui />
                  <span>{t('shop.youHave', { n: fmtNum(qty) })}</span>
                </label>
              }
              action={
                <Button
                  block
                  variant={armed === key ? 'primary' : 'secondary'}
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
                >
                  {armed === key ? t('merchant.confirmShort') : q.units > 0 && q.gold <= 0 ? t('wholesale.paysNothing') : t('wholesale.sell', { n: fmtNum(q.units), g: fmtNum(q.gold) })}
                </Button>
              }
            >
              <p className="shop-each">
                {t('wholesale.priceEach', { n: fmtPrice(wholesaleUnitPrice(id)), m: fmtNum(merchantPrice('material', id)) })}
                {sold > 0 && ` · ${t('wholesale.nextPrice', { n: fmtPrice(next) })} · ${t('wholesale.soldToday', { n: fmtNum(sold) })}`}
              </p>
              <ChipRow<string>
                label={t('inventory.qtyLabel')}
                items={MODES.map((m) => ({ id: String(m), label: m === 'all' ? t('inventory.qtyAll') : m === 'custom' ? t('wholesale.custom') : String(m) }))}
                value={String(modeOf(id))}
                onChange={(v) => {
                  setModes({ ...modes, [id]: (v === 'all' || v === 'custom' ? v : Number(v)) as Mode });
                  setArmed(null);
                }}
              />
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
            </ItemCard>
          );
        })}
      </div>

      {rows.length > 0 && (
        <Panel tone="inset" className="ws-batch">
          <span className="ui-note">{t('wholesale.selectedHint', { n: tickedLines.length, u: fmtNum(tickedPlan.units) })}</span>
          <Button variant="primary" disabled={tickedPlan.lines.length === 0} onClick={() => askSell(tickedLines)}>
            {t('wholesale.sellSelected', { n: tickedPlan.lines.length })}
          </Button>
        </Panel>
      )}

      {confirm && confirmPlan && (
        <Dialog
          icon={confirm.step === 'rare' ? <span aria-hidden>★</span> : undefined}
          title={confirm.step === 'rare' ? t('wholesale.rareTitle') : t('wholesale.confirmTitle')}
          footer={
            <>
              <Button variant="primary" block onClick={proceed}>
                {confirm.step === 'rare' ? t('wholesale.rareYes') : t('wholesale.confirmYes')}
              </Button>
              <Button block onClick={() => setConfirm(null)}>
                {t('wholesale.cancel')}
              </Button>
            </>
          }
        >
          {confirm.step === 'list' ? (
            <>
              <ul className="ws-confirm-list">
                {confirmPlan.lines.map((l) => (
                  <li key={l.id}>{t('wholesale.confirmLine', { name: nameOf(l.id), n: fmtNum(l.units), g: fmtNum(l.gold) })}</li>
                ))}
              </ul>
              <p className="ws-confirm-total">{t('wholesale.confirmTotal', { n: fmtNum(confirmPlan.units), g: fmtNum(confirmPlan.gold) })}</p>
            </>
          ) : (
            <>
              <p className="ws-confirm-total">{t('wholesale.rareWarn')}</p>
              <p className="ui-note">{t('wholesale.rareList', { names: confirmPlan.lines.filter((l) => l.rare).map((l) => nameOf(l.id)).join(', ') })}</p>
              <p className="ui-note">{t('wholesale.confirmTotal', { n: fmtNum(confirmPlan.units), g: fmtNum(confirmPlan.gold) })}</p>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
