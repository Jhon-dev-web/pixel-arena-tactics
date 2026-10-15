// WHO ROLLS THE DICE OF A TRADEABLE THING. In the web build (a Supabase backend, a signed-in account) the SERVER does: the forge rarity and substats, the unique drops of Hunting and of the
// Dungeon bosses, the Gold Pouch (supabase/functions/mint-item, docs/MARKET_FOUNDATION.md). The client then applies exactly what the server returned and never rolls those things itself,
// so there is nothing to fish for locally. In the offline / desktop build there is no server: everything keeps rolling on the device, and what it makes is never tradeable (it has no
// certificate; items it creates are marked `certified: false`).
//
// GameShell sets the mode next to the Adventurer Pass source (setPassSource): 'server' exactly when the build has a backend.

export type ItemAuthority = 'server' | 'local';

let authority: ItemAuthority = 'local';

export const setItemAuthority = (mode: ItemAuthority): void => {
  authority = mode;
};

export const isServerItemAuthority = (): boolean => authority === 'server';
