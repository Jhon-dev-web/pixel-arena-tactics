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
