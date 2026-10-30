// The map of the side menu: which screen lives under which of the eight entries, and which ones moved to the top bar or the gear.
// Pure data (no React), so a test can prove that no screen that was one tap away in the old 18-entry menu became unreachable, and that its "needs attention" dot still reaches the entry.
//
// An entry with several screens opens its first one; the others are tabs on that screen (App.tsx draws the strip). Nothing here changes what a screen does.

export type ScreenId =
  | 'home'
  | 'personagem'
  | 'skills'
  | 'tactics'
  | 'hunt'
  | 'dungeon'
  | 'mining'
  | 'woodcutting'
  | 'garden'
  | 'oficios'
  | 'forge'
  | 'inventory'
  | 'deliveries'
  | 'shop'
  | 'market'
  | 'pass'
  | 'quests'
  | 'codex'
  | 'calendar'
  | 'invites'
  | 'settings';

export type EntryId = 'camp' | 'hero' | 'hunt' | 'dungeon' | 'professions' | 'forge' | 'shop' | 'pass';

export interface NavEntryDef {
  id: EntryId;
  // The first one is what the entry opens; the rest are its tabs.
  screens: ScreenId[];
}

export const NAV_ENTRIES: NavEntryDef[] = [
  { id: 'camp', screens: ['home'] },
  { id: 'hero', screens: ['personagem', 'skills', 'tactics'] },
  { id: 'hunt', screens: ['hunt'] },
  { id: 'dungeon', screens: ['dungeon'] },
  { id: 'professions', screens: ['mining', 'woodcutting', 'garden', 'oficios'] },
  { id: 'forge', screens: ['forge'] },
  { id: 'shop', screens: ['shop', 'deliveries', 'market'] },
  { id: 'pass', screens: ['pass'] },
];

// Always on screen in the top bar (the quests: the one thing opened by a notice, not by will).
export const TOPBAR_SCREENS: ScreenId[] = ['quests'];
// One tap on the gear of the top bar.
export const GEAR_SCREENS: ScreenId[] = ['settings', 'codex', 'calendar', 'invites'];
// Not an entry of their own: the Inventory is the bag block of Personagem (and the bag button of the Camp).
export const INSIDE_SCREENS: Partial<Record<ScreenId, ScreenId>> = { inventory: 'personagem' };

// Only exist with an account / in the web build; the others are always there.
export const ONLINE_ONLY: ScreenId[] = ['market', 'invites'];

export function visibleScreens(entry: NavEntryDef, online: { market: boolean; account: boolean }): ScreenId[] {
  return entry.screens.filter((s) => (s === 'market' ? online.market : s === 'invites' ? online.account : true));
}

export function entryOf(screen: ScreenId): EntryId | null {
  return NAV_ENTRIES.find((e) => e.screens.includes(screen))?.id ?? null;
}

// Where a screen is found: an entry (opening it or one of its tabs), the top bar, the gear, or inside another screen that is itself reachable.
export function whereIs(screen: ScreenId): { via: 'entry' | 'topbar' | 'gear' | 'inside'; entry?: EntryId; host?: ScreenId } | null {
  const entry = entryOf(screen);
  if (entry) return { via: 'entry', entry };
  if (TOPBAR_SCREENS.includes(screen)) return { via: 'topbar' };
  if (GEAR_SCREENS.includes(screen)) return { via: 'gear' };
  const host = INSIDE_SCREENS[screen];
  return host ? { via: 'inside', host } : null;
}

// The dot of an entry: on when any screen under it has something waiting.
export function entryBadge(entry: NavEntryDef, badges: Partial<Record<ScreenId, boolean>>): boolean {
  return entry.screens.some((s) => badges[s]);
}
