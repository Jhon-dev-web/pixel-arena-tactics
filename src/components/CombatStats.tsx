import { useEffect, useId, useRef, useState } from 'react';
import { t } from '../locales';
import { mitigationFraction } from '../game/derivedStats';
import { formatNumber, SaveData } from '../game/engine';
import { StatBreakdown, StatId, StatRow } from '../game/statBreakdown';
import { fmtDec, fmtDelta, fmtLeft, fmtLine, fmtStat, sourceLabel, statName } from './statFormat';
import { useStatBreakdown } from './useStatBreakdown';
import ActiveBuffs from './ActiveBuffs';

// The seven stats the panel always had, then the ones that appear once the hero has them.
const ALWAYS: StatId[] = ['maxHp', 'damage', 'critChance', 'critMult', 'defense', 'attackSpeed', 'lifesteal'];
const WHEN_PRESENT: StatId[] = ['regen', 'reflect', 'gold', 'xp'];

const EPS = 1e-9;
const differs = (row: StatRow): boolean => Math.abs(row.now - row.permanent) > EPS;

// What the elixirs add to a stat, as the panel shows it: a multiplier for the damage (the elixirs multiply), the amount in the stat's own unit for the others.
function buffChip(row: StatRow): string {
  if (row.id === 'damage') return t('statsPanel.fromBuffs', { v: `×${fmtDec(row.now / row.permanent, 2)}` });
  if (row.id === 'defense') {
    const d = (mitigationFraction(row.now) - mitigationFraction(row.permanent)) * 100;
    return t('statsPanel.fromBuffs', { v: `+${fmtDec(d)}%` });
  }
  return t('statsPanel.fromBuffs', { v: fmtDelta(row.id, row.now - row.permanent) });
}

function Breakdown({ row, bd }: { row: StatRow; bd: StatBreakdown }) {
  const perm = row.lines.filter((l) => !l.temporary);
  const temp = row.lines.filter((l) => l.temporary);
  return (
    <>
      <h4 className="stat-breakdown-title">{t('statsPanel.breakdownTitle', { stat: statName(row.id) })}</h4>
      <ul className="stat-lines">
        {perm.map((l) => (
          <li key={l.source}>
            <span className="stat-src">{sourceLabel(l.source)}</span>
            <span className="stat-val">{fmtLine(row.id, l)}</span>
          </li>
        ))}
      </ul>
      {temp.length > 0 && (
        <>
          <div className="stat-lines-head">{t('statsPanel.temporary')}</div>
          <ul className="stat-lines temp">
            {temp.map((l) => (
              <li key={l.source}>
                <span className="stat-src">
                  {sourceLabel(l.source)}
                  <span className="stat-left">{l.remainingMs === null ? t('statsPanel.untilRun') : t('statsPanel.left', { t: fmtLeft(l.remainingMs) })}</span>
                </span>
                <span className="stat-val">{fmtLine(row.id, l)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {row.id === 'defense' && (
        <p className="stat-note">{t('statsPanel.defenseRaw', { raw: `${fmtDec(row.now * 100)}%`, pct: `${fmtDec(mitigationFraction(row.now) * 100)}%` })}</p>
      )}
      <div className="stat-totals">
        <span>
          {t('statsPanel.permanent')}: <b>{fmtStat(row.id, row.permanent)}</b>
        </span>
        {differs(row) && (
          <span>
            {t('statsPanel.totalNow')}: <b>{fmtStat(row.id, row.now)}</b>
          </span>
        )}
      </div>
      {bd.temporaries.length === 0 && row.lines.length === 1 && <p className="stat-note">{t('statsPanel.tapHint')}</p>}
    </>
  );
}

// "Status de combate": the total RIGHT NOW (elixirs and tonics included) in every cell, the permanent value muted beside it when something temporary changes it, and a
// breakdown by source under the grid for the stat that was tapped / hovered / focused. Works on touch (a tap opens it, another closes it), from the keyboard (the cells are
// buttons) and closes with Escape.
export function CombatStatsGrid({ save }: { save: SaveData }) {
  const bd = useStatBreakdown(save);
  const [open, setOpen] = useState<StatId | null>(null);
  const [pinned, setPinned] = useState(false);
  const regionId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null);
        setPinned(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const ids = [...ALWAYS, ...WHEN_PRESENT.filter((id) => bd.rows[id].now > EPS || bd.rows[id].permanent > EPS)];
  const toggle = (id: StatId) => {
    if (open === id && pinned) {
      setOpen(null);
      setPinned(false);
    } else {
      setOpen(id);
      setPinned(true);
    }
  };

  return (
    <div className="combat-stats" ref={root} onMouseLeave={() => !pinned && setOpen(null)}>
      <div className="hero-stats-grid">
        {ids.map((id) => {
          const row = bd.rows[id];
          const buffed = differs(row);
          return (
            <button
              key={id}
              type="button"
              className={`hero-stat-cell stat-cell${buffed ? ' buffed' : ''}${open === id ? ' open' : ''}`}
              aria-expanded={open === id}
              aria-controls={regionId}
              onClick={() => toggle(id)}
              onPointerEnter={(e) => {
                if (e.pointerType === 'touch' || pinned) return;
                setOpen(id);
              }}
              onFocus={() => !pinned && setOpen(id)}
              onBlur={() => !pinned && setOpen(null)}
              data-ui
            >
              <span>
                {statName(id)}
              </span>
              <span className={id === 'maxHp' || id === 'damage' ? 'num-abbr' : undefined}>{fmtStat(id, row.now)}</span>
              {buffed && (
                <span className="stat-buff">
                  {buffChip(row)} · <span className="stat-base">{t('statsPanel.base', { v: fmtStat(id, row.permanent) })}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <ActiveBuffs save={save} />
      <div id={regionId} className={`stat-breakdown${open ? ' open' : ''}`} role="region" aria-live="polite" hidden={!open}>
        {open && (
          <>
            <Breakdown row={bd.rows[open]} bd={bd} />
            <button
              type="button"
              className="stat-breakdown-close"
              onClick={() => {
                setOpen(null);
                setPinned(false);
              }}
              data-ui
            >
              {t('statsPanel.close')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// "CP: 800" and, while elixirs change it, "CP now: 842". The first is the CP the recommendations are compared against (computeCP); the second is informational.
export function CpLine({ save }: { save: SaveData }) {
  const bd = useStatBreakdown(save);
  return (
    <>
      {t('profile.cp')}: <span className="num-abbr">{formatNumber(bd.cpPermanent)}</span>
      {bd.cpNow !== bd.cpPermanent && (
        <span className="cp-now" title={t('statsPanel.cpNowHint')}>
          {' '}
          · {t('statsPanel.cpNow')}: <span className="num-abbr">{formatNumber(bd.cpNow)}</span>
        </span>
      )}
    </>
  );
}
