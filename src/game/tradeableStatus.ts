// Is the item server reachable right now, as far as the last call to it can tell? Tradeable materials are recorded on the server (burn on use, balances), so while it cannot be reached the game
// refuses to SPEND tradeable units (normal units are never affected). tradeableActions.ts updates this after every call; a browser that reports itself offline counts as unreachable at once.

// A failure EXPIRES. The gate in App.tsx (setSaveBoth) refuses a spend and returns BEFORE anything talks to the server, and tradeableActions.ts only marked the server reachable again after a call that
// succeeded: once one call had failed nothing on the blocked path ever tried again, so a player stayed locked out after the server came back, until he reloaded the page (it happened to the owner on
// 28/10: the server was out of date, a call failed, the functions were republished, his client never asked again). After this long the flag stops saying "down", which gives back the right to TRY, never
// the right to act without an answer: the spend is queued as a burn and the server answers it (flushBurns); if that fails the flag falls again and the clock restarts. 30 s is the retry interval the sync
// already uses (useTradeableSync RETRY_MS): long enough not to hammer a server that is really down, short enough that "wait for the connection" is not a lie.
export const TRADEABLE_RETRY_AFTER_MS = 30_000;

// When the last call failed (ms), or null when the last call went through.
let failedAt: number | null = null;

export const setTradeableReachable = (value: boolean, now: number = Date.now()): void => {
  failedAt = value ? null : now;
};

export const isTradeableReachable = (now: number = Date.now()): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return failedAt === null || now - failedAt >= TRADEABLE_RETRY_AFTER_MS;
};
