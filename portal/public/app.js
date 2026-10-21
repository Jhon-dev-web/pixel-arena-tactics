document.documentElement.classList.add('has-js');
const toggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#main-nav');
const header = document.querySelector('.site-header');
const groups = [...document.querySelectorAll('header details')];
function closeMenu(restoreFocus = false) {
  groups.forEach(group => { group.open = false; });
  toggle?.setAttribute('aria-expanded', 'false');
  navigation?.classList.remove('open');
  if (restoreFocus) toggle?.focus();
}
toggle?.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', String(open));
  navigation?.classList.toggle('open', open);
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const inside = navigation?.contains(document.activeElement);
  const expanded = groups.find(group => group.open && group.contains(document.activeElement));
  if (toggle?.getAttribute('aria-expanded') === 'true') closeMenu(Boolean(inside));
  else if (expanded) { expanded.open = false; expanded.querySelector('summary')?.focus(); }
});
document.addEventListener('click', event => {
  groups.forEach(group => { if (!group.contains(event.target)) group.open = false; });
  if (!header?.contains(event.target)) closeMenu();
});
header?.addEventListener('focusout', event => {
  if (event.relatedTarget && !header.contains(event.relatedTarget)) closeMenu();
});
matchMedia('(max-width: 1250px)').addEventListener('change', () => closeMenu());
// Playtest countdown on the Home (data-countdown holds the start date).
const countdown = document.querySelector('[data-countdown]');
if (countdown) {
  const start = Date.parse(countdown.dataset.countdown);
  const cells = Object.fromEntries([...countdown.querySelectorAll('[data-cd]')].map(cell => [cell.dataset.cd, cell]));
  const pad = n => String(n).padStart(2, '0');
  const tick = () => {
    const left = start - Date.now();
    if (!(left > 0)) {
      countdown.querySelector('[data-cd-label]').textContent = countdown.dataset.started;
      countdown.querySelector('[data-cd-tiles]').hidden = true;
      countdown.querySelector('[data-cd-date]').textContent = countdown.dataset.startedNote;
      return false;
    }
    const sec = Math.floor(left / 1000);
    cells.d.textContent = String(Math.floor(sec / 86400));
    cells.h.textContent = pad(Math.floor(sec / 3600) % 24);
    cells.m.textContent = pad(Math.floor(sec / 60) % 60);
    cells.s.textContent = pad(sec % 60);
    return true;
  };
  if (Number.isFinite(start) && tick()) { const timer = setInterval(() => { if (!tick()) clearInterval(timer); }, 1000); }
}
