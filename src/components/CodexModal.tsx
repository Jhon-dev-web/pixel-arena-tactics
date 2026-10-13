import { useState } from 'react';
import { fmtNum, t } from '../locales';
import { SaveData } from '../game/engine';
import { GEAR_SLOT_ORDER, CODEX_ITEMS, CODEX_MATERIALS, CODEX_MONSTERS, CODEX_TABS, CodexMonster, CodexTab, DropWording, codexProgress, materialSources, monsterDrops } from '../game/codex';
import { GearItem, getGear } from '../game/gear';
import { getMaterial, MaterialId } from '../game/materials';
import { getHuntingZone } from '../game/huntingZones';
import { getGem } from '../game/gems';
import { statsOf } from '../game/stats';
import { gearStatLines } from './gearStats';
import { setFamilyName } from './setText';
import GearIcon from './GearIcon';
import MaterialIcon from './MaterialIcon';
import SpriteSheet from './SpriteSheet';
import { MonsterPortrait } from './HuntParts';

// The codex screen: three lists (gear, materials, monsters) of tiles that are silhouettes until discovered, a completion bar per tab and overall, and a
// small detail panel for the tile that was tapped. Nothing here changes the save.

const gearName = (item: GearItem): string => t(`gear.${item.nameKey}`);
const matName = (id: string): string => {
  const m = getMaterial(id as MaterialId);
  return m ? t(`materials.${m.nameKey}`) : id;
};
const zoneName = (id: string): string => {
  const z = getHuntingZone(id);
  return z ? t(`dungeon.${z.nameKey}`) : id;
};
const wording = (w: DropWording): string => t(`codex.rar_${w}`);

function MaterialArt({ id }: { id: MaterialId }) {
  const def = getMaterial(id);
  return def ? <MaterialIcon item={def} className="pixel-icon" /> : null;
}

function MonsterArt({ m }: { m: CodexMonster }) {
  if (m.huntEnemy) return <MonsterPortrait enemyId={m.huntEnemy} box="52px" />;
  return <SpriteSheet src={m.spriteUrl ?? ''} size="56px" row={0} frames={1} className={m.tintClass} />;
}

function sourceLine(item: GearItem): string {
  if (item.source && 'zone' in item.source) return t('codex.srcZone', { zone: zoneName(item.source.zone) });
  if (item.source && 'bossFloor' in item.source) return t('codex.srcBoss', { n: item.source.bossFloor });
  return t('codex.srcForge');
}

function ItemDetail({ item, found }: { item: GearItem; found: boolean }) {
  const unique = !!item.unique;
  const recipe = item.recipe;
  return (
    <div className="codex-detail" data-codex-detail={item.id}>
      <div className="codex-detail-head">
        <span className={`codex-art${found ? '' : ' unknown'}`}>
          <GearIcon item={item} />
        </span>
        <div className="codex-detail-title">
          <span className="codex-detail-name">{found ? gearName(item) : t('codex.unknown')}</span>
          <span className="codex-detail-sub">
            {t(`gear.${item.slot}`)}
            {found && item.tier ? ` · ${t('codex.tier', { n: item.tier })}` : ''}
            {found && item.setFamily ? ` · ${t('codex.set', { name: setFamilyName(item.setFamily) })}` : ''}
            {unique ? ` · ${t('codex.uniqueTag')}` : ''}
          </span>
        </div>
      </div>
      {found ? (
        <ul className="codex-lines">
          {gearStatLines(item).map((l, i) => (
            <li key={i}>{l.text}</li>
          ))}
        </ul>
      ) : (
        unique && <p className="codex-note">{t('codex.statsUnknown')}</p>
      )}
      {(found || unique) && (
        <div className="codex-origin">
          <span className="codex-label">{t('codex.origin')}</span>
          <span>{sourceLine(item)}</span>
          {found && recipe && (
            <ul className="codex-lines">
              {(recipe.requiredLevel ?? 0) > 0 && <li>{t('forge.levelReq', { n: recipe.requiredLevel ?? 0 })}</li>}
              {item.cost > 0 && <li>{t('codex.goldCost', { n: fmtNum(item.cost) })}</li>}
              {Object.entries(recipe.items ?? {}).map(([id, n]) => (
                <li key={id}>
                  {n}× {getGear(id) ? gearName(getGear(id) as GearItem) : id}
                </li>
              ))}
              {Object.entries(recipe.materials ?? {}).map(([id, n]) => (
                <li key={id}>
                  {n}× {matName(id)}
                </li>
              ))}
              {Object.entries(recipe.gems ?? {}).map(([id, n]) => (
                <li key={id}>
                  {n}× {t(`gems.${getGem(id)?.nameKey ?? id}`)}
                </li>
              ))}
              {(recipe.shards ?? 0) > 0 && <li>{t('codex.shards', { n: recipe.shards ?? 0 })}</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function MaterialDetail({ id, found }: { id: MaterialId; found: boolean }) {
  const def = getMaterial(id);
  return (
    <div className="codex-detail" data-codex-detail={id}>
      <div className="codex-detail-head">
        <span className={`codex-art${found ? '' : ' unknown'}`}>
          <MaterialArt id={id} />
        </span>
        <div className="codex-detail-title">
          <span className="codex-detail-name">{found && def ? t(`materials.${def.nameKey}`) : t('codex.unknown')}</span>
        </div>
      </div>
      {found && (
        <div className="codex-origin">
          <span className="codex-label">{t('codex.origin')}</span>
          <ul className="codex-lines">
            {materialSources(id).map((s, i) => (
              <li key={i}>
                {s.kind === 'hunt' ? t('codex.srcHunt', { zone: zoneName(s.zoneId), rarity: wording(s.rarity) }) : t(`codex.src_${s.kind}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MonsterDetail({ m, found, save }: { m: CodexMonster; found: boolean; save: SaveData }) {
  const stats = statsOf(save);
  const kills = m.zone ? stats.killsByZone[m.zone.id] ?? 0 : stats.dungeonKills[m.id] ?? 0;
  const drops = monsterDrops(m);
  return (
    <div className="codex-detail" data-codex-detail={m.id}>
      <div className="codex-detail-head">
        <span className={`codex-art monster${found ? '' : ' unknown'}`}>
          <MonsterArt m={m} />
        </span>
        <div className="codex-detail-title">
          <span className="codex-detail-name">{found ? t(`enemies.${m.nameKey}`) : t('codex.unknown')}</span>
          <span className="codex-detail-sub">
            {m.zone ? t('codex.zone', { zone: zoneName(m.zone.id) }) : m.depth ? t('dungeon.depthLabel', { n: m.depth }) : m.floors ? (m.floors[0] === m.floors[1] ? t('codex.floor', { n: m.floors[0] }) : t('codex.floors', { a: m.floors[0], b: m.floors[1] })) : ''}
          </span>
        </div>
      </div>
      {found && (
        <>
          <p className="codex-note">{t('codex.kills', { n: fmtNum(kills) })}</p>
          <div className="codex-origin">
            <span className="codex-label">{t('codex.drops')}</span>
            {drops.length === 0 ? (
              <span>{t('codex.noDrops')}</span>
            ) : (
              <ul className="codex-lines">
                {drops.map((d) => {
                  const discovered = d.kind === 'material' ? save.codex?.materials.includes(d.id) : save.codex?.items.includes(d.id);
                  const label = d.kind === 'material' ? matName(d.id) : discovered ? (getGear(d.id) ? gearName(getGear(d.id) as GearItem) : d.id) : t('codex.unknown');
                  return (
                    <li key={`${d.kind}:${d.id}`}>
                      {label} <span className={`codex-rar ${d.wording}`}>{wording(d.wording)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function CodexModal({ save, onClose }: { save: SaveData; onClose: () => void }) {
  const [tab, setTab] = useState<CodexTab>('items');
  const [selected, setSelected] = useState<Record<CodexTab, string | null>>({ items: null, materials: null, monsters: null });
  const progress = codexProgress(save.codex);
  const codex = save.codex ?? { items: [], materials: [], monsters: [] };
  const found = new Set(codex[tab]);
  const pick = (id: string) => setSelected((s) => ({ ...s, [tab]: s[tab] === id ? null : id }));
  const sel = selected[tab];

  return (
    <div className="modal-backdrop">
      <div className="modal codex-modal" role="dialog" aria-label={t('codex.title')}>
        <h2 className="modal-title">
          <span className="codex-title-mark" aria-hidden="true">
            📖
          </span>{' '}
          {t('codex.title')}
        </h2>
        <div className="codex-overall">
          <div className="quest-bar">
            <div className={`quest-bar-fill${progress.overall.pct >= 100 ? ' done' : ''}`} style={{ width: `${progress.overall.pct}%` }} />
          </div>
          <span className="codex-overall-text">{t('codex.overall', { pct: progress.overall.pct, n: progress.overall.found, m: progress.overall.total })}</span>
        </div>

        <div className="inv-tabs">
          {CODEX_TABS.map((id) => (
            <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)} data-ui>
              {t(`codex.tab_${id}`)} {progress[id].pct}%
            </button>
          ))}
        </div>

        <div className="codex-body">
          {sel === null ? (
            <p className="codex-hint">{t('codex.hint', { n: progress[tab].found, m: progress[tab].total })}</p>
          ) : tab === 'items' ? (
            (() => {
              const item = getGear(sel);
              return item ? <ItemDetail item={item} found={found.has(sel)} /> : null;
            })()
          ) : tab === 'materials' ? (
            <MaterialDetail id={sel as MaterialId} found={found.has(sel)} />
          ) : (
            (() => {
              const m = CODEX_MONSTERS.find((x) => x.id === sel);
              return m ? <MonsterDetail m={m} found={found.has(sel)} save={save} /> : null;
            })()
          )}

          {tab === 'items' &&
            GEAR_SLOT_ORDER.map((slot) => {
              const list = CODEX_ITEMS.filter((g) => g.slot === slot);
              if (list.length === 0) return null;
              return (
                <section className="codex-section" key={slot}>
                  <h3 className="quest-group-title">
                    {t(`gear.${slot}`)} {list.filter((g) => found.has(g.id)).length}/{list.length}
                  </h3>
                  <div className="codex-grid">
                    {list.map((g) => (
                      <button key={g.id} className={`codex-tile${found.has(g.id) ? '' : ' unknown'}${sel === g.id ? ' selected' : ''}${g.unique ? ' unique' : ''}`} onClick={() => pick(g.id)} title={found.has(g.id) ? gearName(g) : '???'} data-ui>
                        <span className="codex-art">
                          <GearIcon item={g} />
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}

          {tab === 'materials' && (
            <div className="codex-grid">
              {CODEX_MATERIALS.map((id) => (
                <button key={id} className={`codex-tile${found.has(id) ? '' : ' unknown'}${sel === id ? ' selected' : ''}`} onClick={() => pick(id)} title={found.has(id) ? matName(id) : '???'} data-ui>
                  <span className="codex-art">
                    <MaterialArt id={id} />
                  </span>
                </button>
              ))}
            </div>
          )}

          {tab === 'monsters' && (
            <div className="codex-grid monsters">
              {CODEX_MONSTERS.map((m) => (
                <button key={m.id} className={`codex-tile monster${found.has(m.id) ? '' : ' unknown'}${sel === m.id ? ' selected' : ''}`} onClick={() => pick(m.id)} data-ui>
                  <span className="codex-art monster">
                    <MonsterArt m={m} />
                  </span>
                  <span className="codex-tile-name">{found.has(m.id) ? t(`enemies.${m.nameKey}`) : '???'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="modal-x" onClick={onClose} aria-label={t('ui.close')} data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
