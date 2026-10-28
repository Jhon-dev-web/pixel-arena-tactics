// Items whose art has not been drawn yet. Each one still declares the iconUrl it WILL have (/assets/icons/<id>.png); until that file exists the icon components fall
// back to the item's emoji (their onError path), and the catalog test accepts the missing file for exactly these ids. When the PNG is added, delete the id here
// (the test below insists: an id listed here whose file now exists must be removed, so the list never goes stale).
export const ICON_PENDING: readonly string[] = [
  'flax',
  'cotton',
  'wild_silk',
  'moonweave',
  'voidsilk',
  'cloth_linen',
  'cloth_cotton',
  'cloth_silk',
  'cloth_moon',
  'cloth_void',
  'beast_sinew',
  'feather',
  'arcane_dust',
];

export const isIconPending = (url: string | undefined): boolean => !!url && ICON_PENDING.some((id) => url === `/assets/icons/${id}.png`);
