// Is the item server reachable right now, as far as the last call to it can tell? Tradeable materials are recorded on the server (burn on use, balances), so while it cannot be reached the game
// refuses to SPEND tradeable units (normal units are never affected). tradeableActions.ts updates this after every call; a browser that reports itself offline counts as unreachable at once.
let reachable = true;

export const setTradeableReachable = (value: boolean): void => {
  reachable = value;
};

export const isTradeableReachable = (): boolean => reachable && !(typeof navigator !== 'undefined' && navigator.onLine === false);
