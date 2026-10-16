// "Avise-me no lançamento": the sign-up forms (Home, Temporada), the invite link shown after signing up, and the unsubscribe page. Plain fetch, no SDK, no third-party script.
// The form is hidden in the HTML and shown here, so without JavaScript the page shows a short note instead of a form that cannot work. The e-mail is sent to the Edge Function waitlist-join
// and is never kept in the browser. What IS kept (only when the invite feature is on) is the person's own invite code and private view key, in localStorage, to show the link and the counters again.
import { cleanSupabaseUrl } from '/season-core.js';
import {
  INVITE_STORAGE_KEY, REF_STORAGE_KEY, SHARE_PREFIXES, buildJoinBody, classifyJoin, classifyUnsubscribe, countRequest, countView, countsText, inviteUrl, looksLikeEmail, mergeInvite, parseCounts,
  parseJoinResult, readInvite, referralEndpoint, refFromSearch, shareLinks, sourceFrom, tokenFrom, waitlistEndpoints, withRef, fillText,
} from '/waitlist-core.js';

// Storage can be blocked (private windows, site data off): every access is guarded and the page works without it.
const store = (area, action, key, value) => {
  try {
    const target = area === 'session' ? window.sessionStorage : window.localStorage;
    if (action === 'get') return target.getItem(key);
    if (action === 'set') target.setItem(key, value);
  } catch { /* no storage: fine */ }
  return null;
};

// An invite link lands here as ?ref=CODE (also through the root address, which keeps the query): remember the code for this tab, so a sign-up on another page of the portal still counts.
const landedRef = refFromSearch(location.search);
if (landedRef) store('session', 'set', REF_STORAGE_KEY, landedRef);

const postJson = async (url, body) => {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(10000) });
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  return { status: response.status, json };
};

let countPromise = null; // one request for the public counter, however many blocks are on the page
const loadCount = (endpoints, anonKey) => {
  if (!countPromise) {
    const request = countRequest(endpoints, anonKey);
    countPromise = fetch(request.url, { ...request.init, signal: AbortSignal.timeout(8000) }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  }
  return countPromise;
};

for (const root of document.querySelectorAll('[data-waitlist]')) {
  const lang = root.dataset.lang === 'en' ? 'en' : 'pt';
  const labels = JSON.parse(root.dataset.labels || '{}');
  const base = cleanSupabaseUrl(root.dataset.supabaseUrl);
  const endpoints = waitlistEndpoints(base);
  const anonKey = root.dataset.anonKey || '';
  const referralOn = root.dataset.referral === 'true';
  const $ = selector => root.querySelector(selector);
  const form = $('[data-wl-form]');
  const status = $('[data-wl-status]');
  const done = $('[data-wl-done]');
  const countLine = $('[data-wl-count]');
  if (!form || !endpoints) continue;
  form.hidden = false;
  $('[data-wl-nojs]')?.setAttribute('hidden', '');

  const say = (key, kind) => {
    status.dataset.state = kind;
    status.textContent = labels[key] || '';
  };

  // ---- the invite link (only with config.referralEnabled) ----
  const panel = $('[data-wl-referral]');
  const showInvite = async invite => {
    if (!panel || !invite) return;
    const url = inviteUrl(root.dataset.siteUrl, location.origin, invite.code);
    if (!url) return;
    panel.hidden = false;
    $('[data-wl-link]').value = url;
    const text = fillText(labels.shareText || '{url}', { url });
    const links = shareLinks(url, text);
    for (const anchor of panel.querySelectorAll('[data-wl-share]')) {
      const network = anchor.dataset.wlShare;
      const target = links[network];
      if (target && SHARE_PREFIXES[network] && target.startsWith(SHARE_PREFIXES[network])) anchor.href = target; // the intent of that network and nothing else
    }
    const counts = $('[data-wl-counts]');
    const endpoint = referralEndpoint(base);
    if (counts && endpoint) {
      try {
        const { status: code, json } = await postJson(endpoint, { code: invite.code, key: invite.key });
        const text2 = countsText(parseCounts(code, json), lang, labels);
        if (text2) { counts.textContent = text2; counts.hidden = false; }
      } catch { /* the counters are a bonus: the link works without them */ }
    }
  };
  const copy = $('[data-wl-copy]');
  copy?.addEventListener('click', async () => {
    const field = $('[data-wl-link]');
    const note = $('[data-wl-copy-status]');
    try {
      await navigator.clipboard.writeText(field.value);
      note.textContent = labels.copied || '';
    } catch {
      field.focus();
      field.select();
      note.textContent = labels.copyFailed || '';
    }
  });
  $('[data-wl-link]')?.addEventListener('focus', event => event.target.select());

  const showDone = (text, invite) => {
    form.hidden = true;
    status.textContent = '';
    status.dataset.state = 'ok';
    if (done) { done.hidden = false; done.querySelector('[data-wl-done-text]').textContent = text; }
    showInvite(invite);
  };

  // Back on the page in the same browser after signing up: the link and the counters are right there again.
  const remembered = referralOn ? readInvite(store('local', 'get', INVITE_STORAGE_KEY)) : null;
  if (remembered) showDone(labels.registered || '', remembered);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.busy === 'true') return;
    const data = new FormData(form);
    if (!looksLikeEmail(data.get('email'))) { say('badEmail', 'error'); form.elements.email.focus(); return; }
    if (data.get('consent') !== 'on') { say('needConsent', 'error'); form.elements.consent.focus(); return; }
    const body = withRef(buildJoinBody({ email: data.get('email'), consent: true, hp: data.get('hp'), lang, source: sourceFrom(location.search, document.referrer, location.hostname) }), refFromSearch('?ref=' + (store('session', 'get', REF_STORAGE_KEY) || '')));
    form.dataset.busy = 'true';
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    say('sending', 'busy');
    try {
      const { status: code, json } = await postJson(endpoints.join, body);
      const result = classifyJoin(code, json);
      if (result === 'registered') {
        let invite = null;
        if (referralOn) {
          invite = mergeInvite(remembered ?? readInvite(store('local', 'get', INVITE_STORAGE_KEY)), parseJoinResult(json));
          if (invite) store('local', 'set', INVITE_STORAGE_KEY, JSON.stringify(invite));
        }
        showDone(labels.registered || '', invite);
        return;
      }
      say(result, 'error');
    } catch {
      say('failed', 'error');
    } finally {
      form.dataset.busy = 'false';
      button.disabled = false;
    }
  });

  if (countLine && anonKey) {
    loadCount(endpoints, anonKey).then(raw => {
      const text = countView(raw, lang, labels.count || '');
      if (text) { countLine.textContent = text; countLine.hidden = false; }
    });
  }
}

const unsubscribe = document.querySelector('[data-unsubscribe]');
if (unsubscribe) {
  const labels = JSON.parse(unsubscribe.dataset.labels || '{}');
  const endpoints = waitlistEndpoints(cleanSupabaseUrl(unsubscribe.dataset.supabaseUrl));
  const token = tokenFrom(location.search);
  const button = unsubscribe.querySelector('[data-unsub-button]');
  const status = unsubscribe.querySelector('[data-unsub-status]');
  const say = (key, kind) => { status.dataset.state = kind; status.textContent = labels[key] || ''; };
  if (!endpoints) say('failed', 'error');
  else if (!token) say('bad', 'error');
  else {
    button.hidden = false;
    unsubscribe.querySelector('[data-unsub-nojs]')?.setAttribute('hidden', '');
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const { status: code, json } = await postJson(endpoints.unsubscribe, { token });
        const result = classifyUnsubscribe(code, json);
        if (result === 'done') { button.hidden = true; say('done', 'ok'); } else { say(result, 'error'); button.disabled = false; }
      } catch {
        say('failed', 'error');
        button.disabled = false;
      }
    });
  }
}
