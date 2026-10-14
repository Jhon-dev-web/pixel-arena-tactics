import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  Eligibility,
  fetchLeaderboard,
  fetchMyEntry,
  fetchSeasons,
  LeaderRow,
  MyEntry,
  pickSeason,
  SeasonRow,
  seasonEligibility,
  SubmitStatus,
  useSubmitStatus,
} from '../game/seasonRanking';
import { activeLocale, fmtNum, t } from '../locales';

// The "Temporada" tab of the Adventurer Pass screen: which season, who is on top, and where the player stands. Everything shown is read from the server
// (the season row, the public leaderboard view, the player's own place); the only thing the game sends is the save, from useSeasonSubmit, in the background.
// There is no prize amount in the game: the owner may write `prize_note` on the season row and it is shown here verbatim, only when it is not empty.

const dateText = (iso: string | null): string =>
  !iso ? '-' : new Date(iso).toLocaleDateString(activeLocale === 'pt' ? 'pt-BR' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

function submitLine(s: SubmitStatus): string {
  if (s.state === 'sending') return t('seasonRanking.submit.sending');
  if (s.state === 'error') return t('seasonRanking.submit.error');
  if (s.state === 'idle' || !s.at) return t('seasonRanking.submit.idle');
  const time = new Date(s.at).toLocaleTimeString(activeLocale === 'pt' ? 'pt-BR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const base = s.throttled ? t('seasonRanking.submit.throttled') : t('seasonRanking.submit.done', { time });
  return s.verdict ? `${base} ${t(`seasonRanking.submit.${s.verdict}`)}` : base;
}

const depthText = (f: number, d: number): string => (d > 0 ? `${f} / ${d}` : String(f));

export default function SeasonRankingPanel({ online, ownsPass }: { online: boolean; ownsPass: boolean }) {
  const { user } = useAuth();
  const submit = useSubmitStatus();
  const [season, setSeason] = useState<SeasonRow | null>(null);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [mine, setMine] = useState<MyEntry | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>(online ? 'loading' : 'ready');
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const seasons = await fetchSeasons();
      const picked = pickSeason(seasons, Date.now());
      setSeason(picked);
      if (picked && picked.status !== 'upcoming') {
        const [board, own] = await Promise.all([fetchLeaderboard(picked.number), fetchMyEntry(picked.number).catch(() => null)]);
        setRows(board);
        setMine(own);
      } else {
        setRows([]);
        setMine(null);
      }
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (!online) return;
    void load();
  }, [online, load, attempt]);

  const eligibility: Eligibility = seasonEligibility({
    online,
    season,
    now: Date.now(),
    ownsPass,
    emailConfirmed: !!user?.email_confirmed_at,
    lastVerdict: submit.verdict,
    mine,
  });

  return (
    <section className="ap-season" aria-label={t('seasonRanking.tab')}>
      {season && (
        <div className="ap-season-head">
          <h3 className="ap-h3">{season.kind === 'pre' ? t('seasonRanking.preTitle') : t('seasonRanking.title', { n: season.number })}</h3>
          {season.kind === 'pre' ? (
            <span className="ap-season-dates">{t('seasonRanking.preNote')}</span>
          ) : season.starts_at && season.ends_at && season.freeze_at ? (
            <>
              <span className="ap-season-dates">{t('seasonRanking.dates', { from: dateText(season.starts_at), to: dateText(season.ends_at) })}</span>
              <span className="ap-season-dates">{t('seasonRanking.freeze', { date: dateText(season.freeze_at) })}</span>
            </>
          ) : (
            <span className="ap-season-dates">{t('seasonRanking.waitingGoal')}</span>
          )}
        </div>
      )}

      <p className="ap-season-passonly">{t('seasonRanking.passOnly')}</p>
      {season?.prize_note && season.prize_note.trim() !== '' && <p className="ap-season-prize">{t('seasonRanking.prizeNote', { note: season.prize_note })}</p>}

      <div className={`ap-season-status ${eligibility}`} role="status">
        <strong>{t('seasonRanking.statusTitle')}</strong>
        <span>{t(`seasonRanking.elig.${eligibility}`)}</span>
      </div>

      {online && phase === 'loading' && <p className="ap-season-note">{t('seasonRanking.loading')}</p>}
      {online && phase === 'error' && (
        <p className="ap-season-note">
          {t('seasonRanking.loadError')}{' '}
          <button className="ap-goto" onClick={() => setAttempt((n) => n + 1)} data-ui>
            {t('seasonRanking.retry')}
          </button>
        </p>
      )}

      {online && phase === 'ready' && season && season.status !== 'upcoming' && (
        <>
          <div className="ap-season-mine">
            <strong>{t('seasonRanking.yourPlace')}</strong>
            {mine && mine.rank ? (
              <span>
                {t('seasonRanking.place', { n: fmtNum(mine.rank) })} ·{' '}
                {mine.deepest_depth > 0
                  ? t('seasonRanking.partsDepth', { l: Math.min(100, mine.level_total), f: mine.highest_floor, d: mine.deepest_depth })
                  : t('seasonRanking.parts', { l: Math.min(100, mine.level_total), f: mine.highest_floor })}
                {mine.paragon_level > 0 && ` · ${t('seasonRanking.paragon', { n: mine.paragon_level })}`}
              </span>
            ) : (
              <span>{t('seasonRanking.notRanked')}</span>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="ap-season-note">{t('seasonRanking.empty')}</p>
          ) : (
            <table className="ap-season-table">
              <thead>
                <tr>
                  <th scope="col">{t('seasonRanking.colRank')}</th>
                  <th scope="col">{t('seasonRanking.colHero')}</th>
                  <th scope="col">{t('seasonRanking.colLevel')}</th>
                  <th scope="col">{t('seasonRanking.colDepth')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rank} className={mine?.rank === r.rank ? 'me' : undefined}>
                    <td>{r.rank}</td>
                    <td>
                      {r.username ?? t('seasonRanking.anonymous')}
                      {r.flag_count > 0 && (
                        <span className="ap-season-flag" title={t('seasonRanking.flagTitle')} aria-label={t('seasonRanking.flagTitle')}>
                          {' '}
                          ⚑{r.flag_count}
                        </span>
                      )}
                    </td>
                    <td>
                      {Math.min(100, r.level_total)}
                      {r.paragon_level > 0 && <span className="ap-season-para"> ({t('seasonRanking.paragon', { n: r.paragon_level })})</span>}
                    </td>
                    <td>{depthText(r.highest_floor, r.deepest_depth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {online && <p className="ap-season-submit">{submitLine(submit)}</p>}
    </section>
  );
}
