// Pure helpers of the Temporada page: no DOM, no network. The browser imports this file (season.js) and the Node check (scripts/season-check.mjs) imports the same one.
// Everything that reaches the page from the server goes through here first: numbers are validated, text is escaped. Nothing is ever made up: a missing or
// malformed answer gives null, and the page then says "dados ao vivo indisponíveis" instead of a number.

export const PROFESSIONS = ['mining', 'woodcutting', 'gardening'];
export const RANK_LIMIT = 50;
export const REFRESH_MS = 60_000;

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const wholeNumber = value => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null);

export function formatInt(value, lang) {
  const n = wholeNumber(value);
  return n === null ? '—' : new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US').format(n);
}

/** Replaces {name} in a template with the value as plain text (for textContent). */
export const fillText = (template, values) => String(template).replace(/\{(\w+)\}/g,(_, key) => (key in values ? String(values[key]) : ''));

/** Same, but the value is HTML-escaped (for innerHTML). */
export const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (_, key) => (key in values ? escapeHtml(values[key]) : ''));

/** The public base URL of the Supabase project, or null when it is not a plain https://<ref>.supabase.co address (the CSP only allows that). */
export function cleanSupabaseUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** The four requests of the page. `base` comes from cleanSupabaseUrl. All values are fixed or numbers/known ids: nothing user-provided reaches a URL. */
export function endpoints(base) {
  const rest = `${base}/rest/v1`;
  return {
    meter: { url: `${rest}/rpc/pass_meter`, method: 'POST', body: '{}' },
    seasons: { url: `${rest}/seasons?select=number,kind,status,starts_at,ends_at,freeze_at,prize_note&order=number.desc`, method: 'GET' },
    general: season => ({
      url: `${rest}/season_leaderboard?select=rank,username,level_total,paragon_level,highest_floor,deepest_depth&season=eq.${Number(season)}&flag_count=eq.0&order=rank.asc&limit=${RANK_LIMIT}`,
      method: 'GET',
    }),
    profession: (season, profession) => ({
      url: `${rest}/season_profession_leaderboard?select=rank,username,level,score&season=eq.${Number(season)}&profession=eq.${PROFESSIONS.includes(profession) ? profession : PROFESSIONS[0]}&order=rank.asc&limit=${RANK_LIMIT}`,
      method: 'GET',
    }),
  };
}

export function requestInit(spec, anonKey) {
  const headers = { apikey: anonKey, authorization: `Bearer ${anonKey}`, accept: 'application/json' };
  if (spec.method === 'POST') headers['content-type'] = 'application/json';
  return { method: spec.method, headers, body: spec.body, cache: 'no-store' };
}

/**
 * pass_meter() answers an array with one row (PostgREST) or an object: { progress, season_open, starts_at, ends_at, updated_at }. `progress` is a fraction from 0 to 1 and the ONLY thing the
 * public learns about sales: neither the number of Passes sold nor the goal reaches the page. Returns a validated view, or null when the answer is not what it should be.
 */
export const MIN_BAR_PCT = 3; // a bar with any progress at all is always visibly filled

export function meterView(raw) {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') return null;
  if (typeof row.progress !== 'number' || !Number.isFinite(row.progress) || row.progress < 0) return null; // a string or a missing field is not a fraction
  const progress = Math.min(1, row.progress);
  const pct = Math.round(progress * 1000) / 10; // one decimal; only used for the width of the bar, never written as text
  const open = row.season_open === true;
  const startsAt = open && typeof row.starts_at === 'string' && !Number.isNaN(Date.parse(row.starts_at)) ? row.starts_at : null;
  const endsAt = open && typeof row.ends_at === 'string' && !Number.isNaN(Date.parse(row.ends_at)) ? row.ends_at : null;
  return {
    progress,
    barPct: progress > 0 ? Math.max(pct, MIN_BAR_PCT) : 0,
    open: open && startsAt !== null && endsAt !== null,
    startsAt,
    endsAt,
  };
}

/** What the closed meter shows, as plain text (the script sets it with textContent): the bar and one line, no number of any kind. */
export function meterPresentation(view, labels) {
  return { line: labels.goalLine, barPct: view.barPct };
}

/** The text of a ranking that could not be loaded. It is never the "no players yet" text. */
export const failedRows = labels => `<p class="rank-empty" data-kind="failed">${escapeHtml(labels.rankingFailed)}</p>`;

/** "3 d 4 h" / "4 h 12 min" / "menos de 1 min" until `endMs`; null when it is over. */
export function countdownText(endMs, nowMs, lang) {
  const left = endMs - nowMs;
  if (!(left > 0)) return null;
  const minutes = Math.floor(left / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${mins} min`;
  if (mins > 0) return `${mins} min`;
  return lang === 'pt' ? 'menos de 1 min' : 'under 1 min';
}

export function dateText(iso, lang) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(ms));
}

/**
 * Which season the rankings show. 'paid' = the ranked season that is open now; 'pre' = the pre-season (no prize) while no ranked season is open;
 * 'ended' = the newest ranked season that already ran; 'none' = nothing started yet. Rows that are not what we expect are ignored.
 */
export function pickBoard(rows, now) {
  const seasons = (Array.isArray(rows) ? rows : [])
    .filter(s => s && Number.isInteger(s.number) && typeof s.status === 'string')
    .map(s => ({ ...s, kind: s.kind === 'pre' ? 'pre' : 'ranked' }))
    .sort((a, b) => b.number - a.number);
  const started = s => typeof s.starts_at === 'string' && Date.parse(s.starts_at) <= now;
  const paid = seasons.find(s => s.kind === 'ranked' && s.status === 'open' && started(s));
  if (paid) return { mode: 'paid', season: paid };
  const pre = seasons.find(s => s.kind === 'pre' && s.status === 'open' && started(s));
  if (pre) return { mode: 'pre', season: pre };
  const ended = seasons.find(s => s.kind === 'ranked' && ['frozen', 'closed', 'paid'].includes(s.status));
  if (ended) return { mode: 'ended', season: ended };
  return { mode: 'none', season: null };
}

const cell = (value, cls = '') => `<td${cls ? ` class="${cls}"` : ''}>${value}</td>`;
const playerName = (name, anonymous) => (typeof name === 'string' && name.trim() !== '' ? escapeHtml(name.trim().slice(0, 40)) : `<span class="anon">${escapeHtml(anonymous)}</span>`);

/**
 * The table of a ranking. `kind` is 'general' or 'profession'; `labels` carries the column names and the empty text. Rows with malformed numbers are dropped.
 * The shown position is the order in the (already filtered) list, so a public board never has holes.
 */
export function renderRows(rows, kind, lang, labels) {
  const list = Array.isArray(rows) ? rows : [];
  const body = [];
  for (const row of list.slice(0, RANK_LIMIT)) {
    if (!row || typeof row !== 'object') continue;
    const position = body.length + 1;
    if (kind === 'general') {
      const total = wholeNumber(row.level_total);
      const paragon = wholeNumber(row.paragon_level);
      const floor = wholeNumber(row.highest_floor);
      const depth = wholeNumber(row.deepest_depth);
      if (total === null || floor === null || depth === null) continue;
      const level = `${formatInt(total, lang)}${paragon ? `<small> (${escapeHtml(labels.paragon)} ${formatInt(paragon, lang)})</small>` : ''}`;
      body.push(`<tr>${cell(position, 'num')}<th scope="row">${playerName(row.username, labels.anonymous)}</th>${cell(level, 'num')}${cell(formatInt(floor, lang), 'num')}${cell(formatInt(depth, lang), 'num')}</tr>`);
    } else {
      const level = wholeNumber(row.level);
      const score = wholeNumber(row.score);
      if (level === null || score === null) continue;
      body.push(`<tr>${cell(position, 'num')}<th scope="row">${playerName(row.username, labels.anonymous)}</th>${cell(formatInt(level, lang), 'num')}${cell(formatInt(score, lang), 'num')}</tr>`);
    }
  }
  if (!body.length) return `<p class="rank-empty" data-kind="empty">${escapeHtml(labels.empty)}</p>`;
  const heads = kind === 'general' ? [labels.rank, labels.player, labels.level, labels.floor, labels.depth] : [labels.rank, labels.player, labels.level, labels.xp];
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="${escapeHtml(labels.tableLabel)}"><table class="rank-table"><caption class="sr-only">${escapeHtml(labels.tableLabel)}</caption><thead><tr>${heads.map((h, i) => `<th scope="col"${i === 0 || (i > 1) ? ' class="num"' : ''}>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div>`;
}
