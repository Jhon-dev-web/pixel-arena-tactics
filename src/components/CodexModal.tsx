import { ReactNode, useState } from 'react';
import { fmtNum, fmtPrice, t } from '../locales';
import { merchantPrice } from '../game/merchant';
import { wholesaleUnitPrice } from '../game/wholesale';
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
import { Chip, ItemFrame, Meter, ModalShell, Panel, ScreenLayout, Tabs } from './ui';
import type { TabItem } from './ui';

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

// The square that holds an entry's art: a silhouette (flattened to a dark shape, never readable) until the entry is discovered.
function ArtFrame({ found, rarity = 'common', size = 'md', children }: { found: boolean; rarity?: 'common' | 'legendary'; size?: 'md' | 'lg'; children: ReactNode }) {
  return (
    <span className={`cx-art${found ? '' : ' unknown'}`}>
      <ItemFrame rarity={rarity} size={size}>
        {children}
      </ItemFrame>
    </span>
  );
}

function ItemDetail({ item, found }: { item: GearItem; found: boolean }) {
  const unique = !!item.unique;
  const recipe = item.recipe;
  return (
    <div className="cx-detail" data-codex-detail={item.id}>
      <div className="cx-detail-head">
        <ArtFrame found={found} rarity={unique ? 'legendary' : 'common'}>
          <GearIcon item={item} />
        </ArtFrame>
        <div className="cx-detail-title">
          <span className="cx-detail-name">{found ? gearName(item) : t('codex.unknown')}</span>
          <span className="cx-detail-sub">
            {t(`gear.${item.slot}`)}
            {found && item.tier ? ` · ${t('codex.tier', { n: item.tier })}` : ''}
            {found && item.setFamily ? ` · ${t('codex.set', { name: setFamilyName(item.setFamily) })}` : ''}
            {unique ? ` · ${t('codex.uniqueTag')}` : ''}
          </span>
        </div>
      </div>
      {found ? (
        <ul className="cx-lines">
          {gearStatLines(item).map((l, i) => (
            <li key={i}>{l.text}</li>
          ))}
        </ul>
      ) : (
        unique && <p className="cx-note">{t('codex.statsUnknown')}</p>
      )}
      {(found || unique) && (
        <div className="cx-origin">
          <span className="cx-label">{t('codex.origin')}</span>
          <span>{sourceLine(item)}</span>
          {found && recipe && (
            <ul className="cx-lines">
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
    <div className="cx-detail" data-codex-detail={id}>
      <div className="cx-detail-head">
        <ArtFrame found={found}>
          <MaterialArt id={id} />
        </ArtFrame>
        <div className="cx-detail-title">
          <span className="cx-detail-name">{found && def ? t(`materials.${def.nameKey}`) : t('codex.unknown')}</span>
        </div>
      </div>
      {found && merchantPrice('material', id) > 0 && (
        <div className="cx-origin">
          <span className="cx-label">{t('codex.price')}</span>
          <span className="cx-price">{t('wholesale.codexLine', { m: fmtNum(merchantPrice('material', id)), w: fmtPrice(wholesaleUnitPrice(id)) })}</span>
        </div>
      )}
      {found && (
        <div className="cx-origin">
          <span className="cx-label">{t('codex.origin')}</span>
          <ul className="cx-lines">
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
    <div className="cx-detail" data-codex-detail={m.id}>
      <div className="cx-detail-head">
        <ArtFrame found={found} size="lg">
          <MonsterArt m={m} />
        </ArtFrame>
        <div className="cx-detail-title">
          <span className="cx-detail-name">{found ? t(`enemies.${m.nameKey}`) : t('codex.unknown')}</span>
          <span className="cx-detail-sub">
            {m.zone ? t('codex.zone', { zone: zoneName(m.zone.id) }) : m.depth ? t('dungeon.depthLabel', { n: m.depth }) : m.floors ? (m.floors[0] === m.floors[1] ? t('codex.floor', { n: m.floors[0] }) : t('codex.floors', { a: m.floors[0], b: m.floors[1] })) : ''}
          </span>
        </div>
      </div>
      {found && (
        <>
          <p className="cx-note">{t('codex.kills', { n: fmtNum(kills) })}</p>
          <div className="cx-origin">
            <span className="cx-label">{t('codex.drops')}</span>
            {drops.length === 0 ? (
              <span>{t('codex.noDrops')}</span>
            ) : (
              <ul className="cx-lines">
                {drops.map((d) => {
                  const discovered = d.kind === 'material' ? save.codex?.materials.includes(d.id) : save.codex?.items.includes(d.id);
                  const label = d.kind === 'material' ? matName(d.id) : discovered ? (getGear(d.id) ? gearName(getGear(d.id) as GearItem) : d.id) : t('codex.unknown');
                  return (
                    <li key={`${d.kind}:${d.id}`}>
                      {label} <span className={`cx-rar ${d.wording}`}>{wording(d.wording)}</span>
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

  const tabs: TabItem<CodexTab>[] = CODEX_TABS.map((id) => ({
    id,
    label: (
      <>
        {t(`codex.tab_${id}`)} <span className="cx-pct">{progress[id].pct}%</span>
      </>
    ),
  }));

  const detail =
    sel === null ? (
      <Panel tone="inset" className="cx-hint">
        <p>{t('codex.hint', { n: progress[tab].found, m: progress[tab].total })}</p>
        <Meter pct={progress[tab].pct} done={progress[tab].pct >= 100} thin label={t(`codex.tab_${tab}`)} />
      </Panel>
    ) : tab === 'items' ? (
      (() => {
        const item = getGear(sel);
        return item ? (
          <Panel>
            <ItemDetail item={item} found={found.has(sel)} />
          </Panel>
        ) : null;
      })()
    ) : tab === 'materials' ? (
      <Panel>
        <MaterialDetail id={sel as MaterialId} found={found.has(sel)} />
      </Panel>
    ) : (
      (() => {
        const m = CODEX_MONSTERS.find((x) => x.id === sel);
        return m ? (
          <Panel>
            <MonsterDetail m={m} found={found.has(sel)} save={save} />
          </Panel>
        ) : null;
      })()
    );

  const main = (
    <>
      {tab === 'items' &&
        GEAR_SLOT_ORDER.map((slot) => {
          const list = CODEX_ITEMS.filter((g) => g.slot === slot);
          if (list.length === 0) return null;
          const n = list.filter((g) => found.has(g.id)).length;
          return (
            <Panel
              key={slot}
              title={t(`gear.${slot}`)}
              actions={
                <Chip tone={n === list.length ? 'good' : 'gold'}>
                  {n}/{list.length}
                </Chip>
              }
            >
              <div className="cx-grid">
                {list.map((g) => (
                  <button
                    key={g.id}
                    className={`cx-tile${found.has(g.id) ? '' : ' unknown'}${sel === g.id ? ' selected' : ''}${g.unique ? ' unique' : ''}`}
                    onClick={() => pick(g.id)}
                    title={found.has(g.id) ? gearName(g) : '???'}
                    aria-label={found.has(g.id) ? gearName(g) : t('codex.unknown')}
                    aria-pressed={sel === g.id}
                    data-ui
                  >
                    <ItemFrame rarity={g.unique ? 'legendary' : 'common'}>
                      <GearIcon item={g} />
                    </ItemFrame>
                  </button>
                ))}
              </div>
            </Panel>
          );
        })}

      {tab === 'materials' && (
        <Panel>
          <div className="cx-grid">
            {CODEX_MATERIALS.map((id) => (
              <button
                key={id}
                className={`cx-tile${found.has(id) ? '' : ' unknown'}${sel === id ? ' selected' : ''}`}
                onClick={() => pick(id)}
                title={found.has(id) ? matName(id) : '???'}
                aria-label={found.has(id) ? matName(id) : t('codex.unknown')}
                aria-pressed={sel === id}
                data-ui
              >
                <ItemFrame>
                  <MaterialArt id={id} />
                </ItemFrame>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'monsters' && (
        <Panel>
          <div className="cx-grid monsters">
            {CODEX_MONSTERS.map((m) => (
              <button key={m.id} className={`cx-tile monster${found.has(m.id) ? '' : ' unknown'}${sel === m.id ? ' selected' : ''}`} onClick={() => pick(m.id)} aria-pressed={sel === m.id} data-ui>
                <ItemFrame size="lg">
                  <MonsterArt m={m} />
                </ItemFrame>
                <span className="cx-tile-name">{found.has(m.id) ? t(`enemies.${m.nameKey}`) : '???'}</span>
              </button>
            ))}
          </div>
        </Panel>
      )}
    </>
  );

  return (
    <ModalShell
      className="cx-modal"
      icon={<span aria-hidden>📖</span>}
      title={t('codex.title')}
      subtitle={t('codex.overall', { pct: progress.overall.pct, n: progress.overall.found, m: progress.overall.total })}
      closeLabel={t('ui.close')}
      onClose={onClose}
    >
      <div className="ui-cq cx-root">
        <Meter pct={progress.overall.pct} done={progress.overall.pct >= 100} label={t('codex.title')} />
        <Tabs<CodexTab> items={tabs} value={tab} onChange={setTab} label={t('codex.title')} />
        <ScreenLayout sideFirst main={main} side={detail} />
      </div>
    </ModalShell>
  );
}
