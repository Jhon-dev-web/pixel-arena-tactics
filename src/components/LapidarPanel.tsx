import { useState } from 'react';
import { fmtNum, t } from '../locales';
import { SaveData } from '../game/engine';
import { resolveGearInstance } from '../game/gearInstances';
import { canAffordLapidar, getLapidarCost, lapidarBlock } from '../game/lapidar';
import { lapidarText } from '../game/lateSinks';
import { getMaterial, MaterialId } from '../game/materials';
import { substatNameKey } from '../game/rarity';
import T from '../game/tunables';
import MaterialIcon from './MaterialIcon';
import StashHint from './StashHint';
import { fmtSubstat } from './substatText';

const matText = (k: string): string => t(`materials.${k}`);

// Lapidar (lapidar.ts), under the reforge panel of an Epic / Legendary piece: pick the extra stat that stays, see the exact price of THIS lapidation (it grows with the
// piece's earlier ones), and roll the others again. Every number comes from the engine (getLapidarCost, T.lateSinks), none is typed into the text.
export default function LapidarPanel({ save, instanceId, onLapidar }: { save: SaveData; instanceId: string; onLapidar: (id: string, lockIndex: number) => void }) {
  const [lock, setLock] = useState<number | null>(null);
  const hit = resolveGearInstance(save, instanceId);
  if (!hit || hit.instance.substats.length < 2) return null;
  const { instance } = hit;
  const block = lapidarBlock(save, instanceId);
  const cost = getLapidarCost(save, instanceId);
  const intro = lapidarText();
  if (block === 'level' || block === 'tier') {
    return (
      <div className="reforge-panel lapidar-panel">
        <div className="substat-line">{t('inventory.lapidarTitle')}</div>
        <p className="salvage-hint">{block === 'level' ? t('inventory.lapidarNeedLevel', { n: T.lateSinks.minLevel }) : t('inventory.lapidarNeedTier', { n: T.lateSinks.lapidarMinTier })}</p>
      </div>
    );
  }
  if (!cost || block) return null;
  const chosen = lock !== null && lock < instance.substats.length ? lock : null;
  const rows: { key: string; label: string; have: number; need: number; mat?: MaterialId }[] = [
    { key: 'gold', label: t('inventory.reforgeGold'), have: save.gold, need: cost.gold },
    { key: 'shard', label: t('inventory.reforgeShard'), have: save.shards, need: cost.shards },
    ...Object.entries(cost.materials).map(([mid, need]) => ({ key: mid, label: matText(`mat_${mid}`), have: save.materials[mid as MaterialId] ?? 0, need: need as number, mat: mid as MaterialId })),
  ].filter((r) => r.need > 0);
  return (
    <div className="reforge-panel lapidar-panel" data-testid="lapidar-panel">
      <div className="substat-line">
        {t('inventory.lapidarTitle')} · {t('inventory.lapidarCount', { n: instance.lapidarCount ?? 0 })}
      </div>
      <p className="salvage-hint">{t(intro.key, intro.params)}</p>
      <p className="salvage-hint">{t('inventory.lapidarPick')}</p>
      <div className="substat-list lapidar-picks">
        {instance.substats.map((s, i) => (
          <button key={i} className={`lapidar-pick${chosen === i ? ' active' : ''}`} onClick={() => setLock(i)} aria-pressed={chosen === i} data-ui>
            +{fmtSubstat(s)} {t(`rarity.${substatNameKey(s.type)}`)}
          </button>
        ))}
      </div>
      <div className="salvage-preview reforge-costs">
        {rows.map((r) => (
          <span className="floor-drop" key={r.key}>
            <span className="reforge-cost-name">
              {r.mat && (
                <span className="mat-icon">
                  <MaterialIcon item={getMaterial(r.mat)!} />
                </span>
              )}
              {r.label}
            </span>
            <span className={`req-amount${r.have < r.need ? ' missing' : ''}`}>
              {fmtNum(r.have)} / {fmtNum(r.need)}
            </span>
            {r.mat && <StashHint kind="material" id={r.mat} need={r.need} />}
          </span>
        ))}
      </div>
      <button className="reforge-btn" onClick={() => chosen !== null && onLapidar(instanceId, chosen)} disabled={chosen === null || !canAffordLapidar(save, cost)} data-ui>
        {t('inventory.lapidarBtn')}
      </button>
    </div>
  );
}
