// Items whose art has not been drawn yet. Each one still declares the iconUrl it WILL have (/assets/icons/<id>.png); until that file exists the icon components fall
// back to the item's emoji (their onError path), and the catalog test accepts the missing file for exactly these ids. When the PNG is added, delete the id here
// (the test below insists: an id listed here whose file now exists must be removed, so the list never goes stale).
export const ICON_PENDING: readonly string[] = [
  // Round 12 materials (Gardening 50 / 60 / 70)
  'silver_sage',
  'dusk_orchid',
  'elder_root',
  // Round 12 consumables
  'repair_kit',
  'master_repair_kit',
  'sharpening_stone',
  'armor_polish',
  'hunter_lure',
  'prospector_tonic',
];

export const isIconPending = (url: string | undefined): boolean => !!url && ICON_PENDING.some((id) => url === `/assets/icons/${id}.png`);
