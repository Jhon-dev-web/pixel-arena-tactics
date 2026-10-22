import { useEffect, useState } from 'react';
import { Button, Chip, Panel } from '../ui';
import { t } from '../../locales';
import { useLeagueResetAt } from '../../game/leagueReset';
import { PROFESSION_IDS, ProfessionId } from '../../game/leagueEvents';
import type { SaveData } from '../../game/engine';
import { countdown, eventsView } from './eventsModel';
import './events.css';

// The "Eventos" panel (Rodada 22, docs/SEASON_RANKING.md): the League event running, the next one and how long each takes, drawn from the server's League clock. Before the League opens it shows the
// calendar as "na Liga" (in League days); in the offline / desktop build, which has no League, it shows nothing. The Semana das Profissoes asks for ONE profession here.
const KIND_TONE = { hero: 'gold', profession: 'info', final: 'good' } as const;

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

const eventName = (id: string): string => t(`events.name_${id}`);
const eventDesc = (id: string): string => t(`events.desc_${id}`);
const kindLabel = (kind: 'hero' | 'profession' | 'final'): string => t(`events.kind_${kind}`);
const dayText = (from: number, to: number): string => (from === to ? t('events.day', { a: from }) : t('events.days', { a: from, b: to }));

export default function EventsPanel({ save, onPickProfession, onOpenCalendar }: { save: Pick<SaveData, 'eventBuffs' | 'eventPick'>; onPickProfession: (profession: ProfessionId) => void; onOpenCalendar?: () => void }) {
  const resetAt = useLeagueResetAt();
  const now = useNow(30_000);
  const [open, setOpen] = useState(false);
  const view = eventsView(resetAt, now, save);
  if (view.mode === 'hidden') return null;
  const preseason = view.mode === 'preseason';
  const running = !!view.current; // a League event, or (before the League) a dated one of the server calendar

  return (
    <Panel title={t('events.title')} className="ev-panel" data-testid="events-panel">
      {view.mode === 'preseason' && (
        <div className="ev-block" data-testid="events-preseason">
          <p className="ev-lead">{t('events.preseasonLead')}</p>
          <Button size="sm" className="ev-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? t('events.hideCalendar') : t('events.showCalendar')}
          </Button>
          {open && (
            <ul className="ev-calendar">
              {view.preview.map((e, i) => (
                <li key={i}>
                  <span className="ev-cal-days">
                    {t('events.inLeague')} · {dayText(e.fromDay, e.toDay)}
                  </span>
                  <span className="ev-cal-name">{eventName(e.id)}</span>
                  <Chip tone={KIND_TONE[e.kind]}>{kindLabel(e.kind)}</Chip>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {running && view.current && (
        <div className="ev-block" data-testid="events-running">
          <div className="ev-head">
            <span className="ev-name">{eventName(view.current.id)}</span>
            <Chip tone={KIND_TONE[view.current.kind]}>{kindLabel(view.current.kind)}</Chip>
          </div>
          <p className="ev-desc">{eventDesc(view.current.id)}</p>
          <p className="ev-time">{t('events.endsIn', { t: countdown(view.msToEnd) })}</p>
          {view.current.id === 'profession_week' && (
            <div className="ev-pick" data-testid="events-pick">
              {view.pick.chosen ? (
                <p className="ev-desc">{t('events.picked', { p: t(`events.prof_${view.pick.chosen}`) })}</p>
              ) : (
                <>
                  <p className="ev-desc">{t('events.pickHint')}</p>
                  <div className="ev-pick-row">
                    {PROFESSION_IDS.map((p) => (
                      <Button key={p} size="sm" className="ev-pick-btn" onClick={() => onPickProfession(p)}>
                        {t(`events.prof_${p}`)}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {(view.mode === 'waiting' || (preseason && !running && !!view.next)) && (
        <p className="ev-lead" data-testid="events-waiting">
          {t('events.noneNow')}
        </p>
      )}
      {view.mode === 'over' && (
        <p className="ev-lead" data-testid="events-over">
          {t('events.over')}
        </p>
      )}

      {view.next && (view.mode === 'running' || view.mode === 'waiting' || preseason) && (
        <div className="ev-next" data-testid="events-next">
          <span className="ev-next-label">{t('events.next')}</span>
          <span className="ev-name">{eventName(view.next.id)}</span>
          <span className="ev-time">{t('events.startsIn', { t: countdown(view.msToNext) })}</span>
        </div>
      )}

      {view.buffs.length > 0 && (
        <ul className="ev-buffs" data-testid="events-buffs">
          {view.buffs.map((b, i) => (
            <li key={i}>{t('events.buff', { n: Math.round(b.pct * 100), t: countdown(b.msLeft) })}</li>
          ))}
        </ul>
      )}
      {(view.mode === 'running' || view.mode === 'waiting' || (preseason && (running || !!view.next))) && <p className="ev-foot">{t('events.capNote')}</p>}
      {onOpenCalendar && (
        <Button size="sm" className="ev-toggle ev-open-calendar" onClick={onOpenCalendar} data-testid="events-open-calendar">
          {t('events.openCalendar')}
        </Button>
      )}
    </Panel>
  );
}
