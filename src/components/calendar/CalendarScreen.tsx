import { useEffect, useMemo, useState } from 'react';
import { Button, Chip, PageHeader, Panel, Screen } from '../ui';
import PixelIcon from '../PixelIcon';
import { activeLocale, t } from '../../locales';
import { loadEventCalendar, useEventCalendar } from '../../game/eventCalendar';
import { useLeagueResetAt } from '../../game/leagueReset';
import type { LeagueEventKind } from '../../game/leagueEvents';
import { countdown } from '../events/eventsModel';
import { CalendarEntry, CalendarView, calendarView, formatDayTitle, formatEnd, formatMonthTitle, formatStart, monthGrid, monthOf, shiftMonth, weekdayNames } from './calendarModel';
import './calendar.css';

// The "Calendario" screen (docs/EVENT_CALENDAR.md): a month grid with the events as coloured bars (hero / profession / final), and under it the list: "Agora", "Proximos", "Passados". Dates and times are
// the PLAYER's local time. Before the League opens its events are listed as "Liga: dia N" in their own section (they get dates when it opens). The offline / desktop build has no server calendar: the
// screen says so. The data is the server's word (eventCalendar.ts); nothing here changes any rule.

const KIND_TONE = { hero: 'gold', profession: 'info', final: 'good' } as const;
const eventName = (id: string): string => t(`events.name_${id}`);
const eventDesc = (id: string): string => t(`events.desc_${id}`);
const kindLabel = (kind: LeagueEventKind): string => t(`events.kind_${kind}`);

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

/** One event of the list: name, kind, local dates, what it does, and a countdown when it is the running or the next one. */
function EventItem({ entry, countdownKind, ms }: { entry: CalendarEntry; countdownKind?: 'ends' | 'starts'; ms?: number }) {
  return (
    <li className={`cal-item cal-${entry.kind}`} data-testid="cal-item">
      <div className="cal-item-head">
        <span className="cal-item-name">{eventName(entry.id)}</span>
        <Chip tone={KIND_TONE[entry.kind]}>{kindLabel(entry.kind)}</Chip>
      </div>
      <p className="cal-item-when">{t('calendar.fromTo', { a: formatStart(entry.startMs, activeLocale), b: formatEnd(entry.endMs, activeLocale) })}</p>
      <p className="cal-item-desc">{eventDesc(entry.id)}</p>
      {countdownKind && ms !== undefined && <p className="cal-item-count">{t(countdownKind === 'ends' ? 'events.endsIn' : 'events.startsIn', { t: countdown(ms) })}</p>}
    </li>
  );
}

function Legend() {
  return (
    <ul className="cal-legend" aria-label={t('calendar.legend')}>
      {(['hero', 'profession', 'final'] as const).map((k) => (
        <li key={k}>
          <span className={`cal-swatch cal-swatch-${k}`} aria-hidden /> {kindLabel(k)}
        </li>
      ))}
      <li>
        <span className="cal-swatch cal-swatch-today" aria-hidden /> {t('calendar.today')}
      </li>
    </ul>
  );
}

/** The month grid: a button per day (its events as bars; tapping it opens that day's events under the grid). */
function MonthPanel({ view, now }: { view: CalendarView; now: number }) {
  const [month, setMonth] = useState(() => monthOf(now));
  const [picked, setPicked] = useState<number | null>(null); // local midnight of the picked day
  const weeks = useMemo(() => monthGrid(month.year, month.month, view.entries), [month, view.entries]);
  const names = weekdayNames(activeLocale);
  const today = new Date(now);
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const pickedDay = picked === null ? null : weeks.flat().find((d) => d.startMs === picked) ?? null;
  const title = formatMonthTitle(month.year, month.month, activeLocale);

  return (
    <Panel
      title={title}
      className="cal-month"
      data-testid="cal-month"
      actions={
        <div className="cal-nav">
          <Button size="sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('calendar.prevMonth')}>
            {'<'}
          </Button>
          <Button size="sm" onClick={() => { setMonth(monthOf(now)); setPicked(null); }}>
            {t('calendar.today')}
          </Button>
          <Button size="sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t('calendar.nextMonth')}>
            {'>'}
          </Button>
        </div>
      }
    >
      <div className="cal-grid" role="grid" aria-label={title}>
        <div className="cal-weekdays" role="row">
          {names.map((n, i) => (
            <span key={i} className="cal-weekday" role="columnheader">
              {n}
            </span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div className="cal-week" role="row" key={wi}>
            {week.map((d) => (
              <button
                key={d.startMs}
                type="button"
                role="gridcell"
                className={`cal-day${d.inMonth ? '' : ' out'}${d.startMs === todayMs ? ' today' : ''}${picked === d.startMs ? ' picked' : ''}`}
                aria-pressed={picked === d.startMs}
                aria-label={`${formatDayTitle(d.startMs, activeLocale)}${d.entries.length ? `: ${d.entries.map((e) => eventName(e.id)).join(', ')}` : ''}`}
                onClick={() => setPicked(picked === d.startMs ? null : d.startMs)}
                data-testid="cal-day"
              >
                <span className="cal-daynum">{d.day}</span>
                {d.entries.slice(0, 2).map((e) => (
                  <span
                    key={e.key}
                    className={`cal-bar cal-bar-${e.kind}${e.startMs >= d.startMs ? ' start' : ''}${e.endMs <= d.endMs ? ' end' : ''}`}
                    data-testid="cal-bar"
                  >
                    {(e.startMs >= d.startMs || d.startMs === weeks[wi][0].startMs) && <span className="cal-bar-text">{eventName(e.id)}</span>}
                  </span>
                ))}
              </button>
            ))}
          </div>
        ))}
      </div>
      <Legend />
      {pickedDay && (
        <div className="cal-picked" data-testid="cal-picked">
          <h4 className="cal-picked-title">{formatDayTitle(pickedDay.startMs, activeLocale)}</h4>
          {pickedDay.entries.length === 0 ? (
            <p className="cal-note">{t('calendar.noEventDay')}</p>
          ) : (
            <ul className="cal-list">
              {pickedDay.entries.map((e) => (
                <EventItem key={e.key} entry={e} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}

export default function CalendarScreen() {
  const cal = useEventCalendar();
  const resetAt = useLeagueResetAt();
  const now = useNow(30_000);
  const [showPast, setShowPast] = useState(false);
  const [showLeague, setShowLeague] = useState(false);
  // the League clock is unknown only while it is being asked: with a calendar in hand the screen treats it as "before the League" until the answer arrives
  const view = calendarView(cal.status, cal.events, resetAt === undefined && cal.status === 'ready' ? null : resetAt, now);

  return (
    <Screen label={t('calendar.title')} className="pa-page cal-page" data-testid="calendar-screen">
      <PageHeader icon={<PixelIcon name="calendar" />} title={t('calendar.title')} subtitle={t('calendar.subtitle')} />

      {view.mode === 'offline' && (
        <Panel className="cal-state" data-testid="calendar-offline">
          <p className="cal-note">{t('calendar.offline')}</p>
        </Panel>
      )}
      {view.mode === 'loading' && (
        <Panel className="cal-state" data-testid="calendar-loading">
          <p className="cal-note">{t('calendar.loading')}</p>
        </Panel>
      )}
      {view.mode === 'error' && (
        <Panel className="cal-state" data-testid="calendar-error">
          <p className="cal-note">{t('calendar.error')}</p>
          <Button size="sm" onClick={() => void loadEventCalendar()}>
            {t('calendar.retry')}
          </Button>
        </Panel>
      )}

      {view.mode === 'ready' && (
        <>
          <p className="cal-tz">{t('calendar.timezone', { tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}</p>
          <MonthPanel view={view} now={now} />

          <Panel title={t('calendar.nowTitle')} className="cal-section" data-testid="cal-now">
            {view.current.length > 0 ? (
              <ul className="cal-list">
                {view.current.map((e) => (
                  <EventItem key={e.key} entry={e} countdownKind="ends" ms={e.endMs - now} />
                ))}
              </ul>
            ) : (
              <p className="cal-note">{t('events.noneNow')}</p>
            )}
          </Panel>

          <Panel title={t('calendar.upcomingTitle')} className="cal-section" data-testid="cal-upcoming">
            {view.upcoming.length > 0 ? (
              <ul className="cal-list">
                {view.upcoming.map((e, i) => (
                  <EventItem key={e.key} entry={e} {...(i === 0 ? { countdownKind: 'starts' as const, ms: e.startMs - now } : {})} />
                ))}
              </ul>
            ) : (
              <p className="cal-note">{view.entries.length === 0 ? t('calendar.empty') : t('calendar.noUpcoming')}</p>
            )}
          </Panel>

          {view.past.length > 0 && (
            <Panel
              title={t('calendar.pastTitle')}
              className="cal-section"
              data-testid="cal-past"
              actions={
                <Button size="sm" onClick={() => setShowPast(!showPast)} aria-expanded={showPast}>
                  {showPast ? t('calendar.hide') : t('calendar.show', { n: view.past.length })}
                </Button>
              }
            >
              {showPast && (
                <ul className="cal-list">
                  {view.past.slice(0, 20).map((e) => (
                    <EventItem key={e.key} entry={e} />
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {view.leaguePreview && (
            <Panel
              title={t('calendar.leagueTitle')}
              className="cal-section"
              data-testid="cal-league"
              actions={
                <Button size="sm" onClick={() => setShowLeague(!showLeague)} aria-expanded={showLeague}>
                  {showLeague ? t('calendar.hide') : t('calendar.show', { n: view.leaguePreview.length })}
                </Button>
              }
            >
              <p className="cal-note">{t('calendar.leagueNote')}</p>
              {showLeague && (
                <ul className="cal-list">
                  {view.leaguePreview.map((e, i) => (
                    <li key={i} className={`cal-item cal-${e.kind}`} data-testid="cal-league-item">
                      <div className="cal-item-head">
                        <span className="cal-item-name">{eventName(e.id)}</span>
                        <Chip tone={KIND_TONE[e.kind]}>{kindLabel(e.kind)}</Chip>
                      </div>
                      <p className="cal-item-when">{e.fromDay === e.toDay ? t('calendar.leagueDay', { a: e.fromDay }) : t('calendar.leagueDays', { a: e.fromDay, b: e.toDay })}</p>
                      <p className="cal-item-desc">{eventDesc(e.id)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </>
      )}
    </Screen>
  );
}
