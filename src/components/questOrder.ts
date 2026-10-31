// The order of a list of missions on screen: what can be claimed now first, then what is in progress, then what was already claimed. A view only: inside each group the game's own order stays.
export function byClaimOrder<X>(list: readonly X[], ready: (x: X) => boolean, claimed: (x: X) => boolean): X[] {
  const rank = (x: X): number => (claimed(x) ? 2 : ready(x) ? 0 : 1);
  return list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i)
    .map(({ x }) => x);
}
