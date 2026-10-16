// "Avise-me no lançamento": the sign-up forms (Home, Temporada) and the unsubscribe page. Plain fetch, no SDK, no third-party script. The form is hidden in the HTML and shown here, so
// without JavaScript the page shows a short note instead of a form that cannot work. The e-mail is sent to the Edge Function waitlist-join and is never kept in the browser.
import { cleanSupabaseUrl } from '/season-core.js';
import { buildJoinBody, classifyJoin, classifyUnsubscribe, countRequest, countView, looksLikeEmail, sourceFrom, tokenFrom, waitlistEndpoints } from '/waitlist-core.js';

const postJson = async (url, body) => {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(10000) });
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  return { status: response.status, json };
};

let countPromise = null; // one request for the counter, however many blocks are on the page
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
  const endpoints = waitlistEndpoints(cleanSupabaseUrl(root.dataset.supabaseUrl));
  const anonKey = root.dataset.anonKey || '';
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

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.busy === 'true') return;
    const data = new FormData(form);
    if (!looksLikeEmail(data.get('email'))) { say('badEmail', 'error'); form.elements.email.focus(); return; }
    if (data.get('consent') !== 'on') { say('needConsent', 'error'); form.elements.consent.focus(); return; }
    const body = buildJoinBody({ email: data.get('email'), consent: true, hp: data.get('hp'), lang, source: sourceFrom(location.search, document.referrer, location.hostname) });
    form.dataset.busy = 'true';
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    say('sending', 'busy');
    try {
      const { status: code, json } = await postJson(endpoints.join, body);
      const result = classifyJoin(code, json);
      if (result === 'registered') {
        status.textContent = '';
        status.dataset.state = 'ok';
        form.hidden = true;
        if (done) { done.hidden = false; done.querySelector('[data-wl-done-text]').textContent = labels.registered; }
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
