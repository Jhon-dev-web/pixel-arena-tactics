// The Temporada page: reads the public numbers straight from Supabase with the PUBLIC anon key (plain fetch, no SDK) and fills in the meter and the rankings.
// The page is rendered without data; when the Supabase address or key is not configured, or an answer is not what we expect, it says so and shows no number.
// A failed request is never shown as "no players" and never as a dash: it has its own message.
import { PROFESSIONS, REFRESH_MS, cleanSupabaseUrl, countdownText, dateText, endpoints, escapeHtml, failedRows, fillText, meterPresentation, meterView, pickBoard, renderRows, requestInit } from '/season-core.js';

const root = document.querySelector('[data-season-root]');
if (root) {
  const lang = root.dataset.lang === 'en' ? 'en' : 'pt';
  const labels = JSON.parse(root.dataset.labels || '{}');
  const base = cleanSupabaseUrl(root.dataset.supabaseUrl);
  const anonKey = root.dataset.anonKey || '';
  const meterOptions = { lowPct: Number(root.dataset.lowPct), showCount: root.dataset.showCount !== 'false' };
  const $ = selector => root.querySelector(selector);
  const el = {
    state: $('[data-live-state]'),
    figures: $('[data-meter-figures]'),
    sold: $('[data-meter-sold]'),
    target: $('[data-meter-target]'),
    pct: $('[data-meter-pct]'),
    line: $('[data-meter-line]'),
    bar: $('[data-meter-bar]'),
    fill: $('[data-meter-fill]'),
    label: $('[data-meter-label]'),
    closed: $('[data-meter-closed]'),
    open: $('[data-meter-open]'),
    openDates: $('[data-open-dates]'),
    openCountdown: $('[data-open-countdown]'),
    openSold: $('[data-open-sold]'),
    boardTitle: $('[data-board-title]'),
    boardNote: $('[data-board-note]'),
    prize: $('[data-board-prize]'),
    general: $('[data-general]'),
    profession: $('[data-profession]'),
    tabs: [...root.querySelectorAll('[data-profession-tab]')],
  };
  let current = { mode: null, season: null };
  let profession = PROFESSIONS[0];
  let timer = null;
  let countdownTimer = null;
  let endMs = null;

  const setState = (kind, text) => {
    el.state.dataset.state = kind;
    el.state.textContent = text;
  };

  async function get(spec) {
    const response = await fetch(spec.url, { ...requestInit(spec, anonKey), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('http_' + response.status);
    return response.json();
  }

  function paintMeter(view) {
    if (view.open) {
      el.closed.hidden = true;
      el.open.hidden = false;
      el.openDates.textContent = fillText(labels.openDates, { from: dateText(view.startsAt, lang), to: dateText(view.endsAt, lang) });
      el.openSold.textContent = view.showCount ? fillText(labels.openSold, { sold: view.soldText }) : '';
      endMs = Date.parse(view.endsAt);
      tickCountdown();
      return;
    }
    endMs = null;
    el.open.hidden = true;
    el.closed.hidden = false;
    const shown = meterPresentation(view, labels);
    el.bar.hidden = false;
    el.label.hidden = false;
    el.figures.hidden = !shown.figures;
    el.line.hidden = !shown.line;
    el.line.textContent = shown.line;
    if (shown.figures) {
      el.sold.textContent = view.soldText;
      el.target.textContent = view.targetText;
      el.pct.textContent = view.pctText;
    }
    el.fill.style.width = shown.barPct + '%'; // CSSOM, allowed under the strict CSP (no inline style attribute)
    if (view.showCount) {
      el.bar.setAttribute('aria-valuenow', String(view.pct));
      el.bar.setAttribute('aria-valuetext', shown.line || `${view.soldText} / ${view.targetText} (${view.pctText})`);
    } else {
      el.bar.removeAttribute('aria-valuenow');
      el.bar.setAttribute('aria-valuetext', shown.line);
    }
    el.label.textContent = shown.goal;
  }

  function tickCountdown() {
    if (endMs === null) return;
    const text = countdownText(endMs, Date.now(), lang);
    el.openCountdown.textContent = text ? fillText(labels.openEnds, { time: text }) : labels.openOver;
  }

  function paintBoard(board) {
    current = board;
    const season = board.season;
    const title = { paid: labels.boardPaid, pre: labels.boardPre, ended: labels.boardEnded, none: labels.boardNone }[board.mode];
    el.boardTitle.textContent = title;
    el.boardNote.textContent = { paid: labels.noteOnlyPass, pre: labels.notePre, ended: labels.noteEnded, none: labels.noteNone }[board.mode];
    const prize = season && board.mode !== 'pre' && typeof season.prize_note === 'string' ? season.prize_note.trim().slice(0, 300) : '';
    el.prize.textContent = prize ? fillText(labels.prize, { note: prize }) : '';
    el.prize.hidden = !prize;
  }

  // A ranking that fails keeps the rows already on screen (with the "may be out of date" note); with nothing on screen it says the ranking is unavailable. It never says "no players".
  const showRanking = async (target, load) => {
    try {
      target.innerHTML = await load();
      target.dataset.ok = 'true';
      return true;
    } catch {
      if (target.dataset.ok !== 'true') target.innerHTML = failedRows(labels);
      return false;
    }
  };

  const loadGeneral = () => showRanking(el.general, async () => {
    if (!current.season) return `<p class="rank-empty" data-kind="empty">${escapeHtml(labels.empty)}</p>`;
    return renderRows(await get(endpoints(base).general(current.season.number)), 'general', lang, { ...labels, tableLabel: labels.generalTable });
  });

  const loadProfession = () => showRanking(el.profession, async () => {
    if (!current.season) return `<p class="rank-empty" data-kind="empty">${escapeHtml(labels.empty)}</p>`;
    return renderRows(await get(endpoints(base).profession(current.season.number, profession)), 'profession', lang, { ...labels, tableLabel: labels.professionTable });
  });

  // Whatever could not be loaded and has nothing real on screen yet says so (the meter and both rankings), instead of an empty box or a dash.
  function showFailure() {
    if (!root.classList.contains('is-live')) el.boardNote.textContent = '';
    if (el.general.dataset.ok !== 'true') el.general.innerHTML = failedRows(labels);
    if (el.profession.dataset.ok !== 'true') el.profession.innerHTML = failedRows(labels);
  }

  async function refresh() {
    if (!base || !anonKey) return;
    try {
      const [meterRaw, seasonRows] = await Promise.all([get(endpoints(base).meter), get(endpoints(base).seasons)]);
      const view = meterView(meterRaw, lang, meterOptions);
      if (!view) throw new Error('bad_meter');
      paintMeter(view);
      paintBoard(pickBoard(seasonRows, Date.now()));
      root.classList.add('is-live');
      const [generalOk, professionOk] = await Promise.all([loadGeneral(), loadProfession()]);
      if (generalOk && professionOk) setState('live', labels.live);
      else setState('unavailable', labels.stale);
    } catch {
      // Keep whatever real numbers are already on the page; just say they may be old (or, on the first load, that the data is unavailable).
      if (root.classList.contains('is-live')) setState('unavailable', labels.stale);
      else { setState('unavailable', labels.meterFailed); showFailure(); }
    }
  }

  for (const tab of el.tabs) {
    tab.addEventListener('click', () => {
      profession = PROFESSIONS.includes(tab.dataset.professionTab) ? tab.dataset.professionTab : PROFESSIONS[0];
      for (const other of el.tabs) other.setAttribute('aria-selected', String(other === tab));
      el.profession.setAttribute('aria-labelledby', tab.id);
      loadProfession().then(ok => { if (!ok) setState('unavailable', labels.stale); });
    });
    tab.addEventListener('keydown', event => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      const next = el.tabs[(el.tabs.indexOf(tab) + step + el.tabs.length) % el.tabs.length];
      next.focus();
      next.click();
      event.preventDefault();
    });
  }

  if (base && anonKey) {
    setState('loading', labels.loading);
    refresh();
    const start = () => {
      timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);
      countdownTimer = setInterval(tickCountdown, 30_000);
    };
    start();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
    window.addEventListener('pagehide', () => { clearInterval(timer); clearInterval(countdownTimer); });
  }
}
