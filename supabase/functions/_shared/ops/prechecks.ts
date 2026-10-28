import type { Aggregates, Category, Evidence, Severity, Signal } from './types.ts';
import { maxSeverity } from './types.ts';

// The deterministic pre-checks of the AI auditor: plain arithmetic over the compact aggregates. They decide WHETHER the model is called at all (nothing found = no model call, no cost) and they are the only
// source of evidence a finding may cite. Every number below is a starting calibration, NOT a measured limit: tune them against the real server data (docs/AI_OPS.md, "Calibração").
// Summaries are machine-written Portuguese built from numbers; player-supplied text (usernames) only ever appears in `evidence[].label`.

export const THRESHOLDS = {
  // anti-cheat
  rejectedSnapshotsMedium: 1,
  accountsWithNewFlagsMedium: 5,
  accountsWithNewFlagsHigh: 20,
  itemFlagsMedium: 3,
  itemFlagsHigh: 15,
  // level / XP jumps (levelTotal gained between the first and the last accepted snapshot of the window)
  jumpLevelsMedium: 8,
  jumpLevelsPerHourMedium: 6,
  jumpLevelsHigh: 25,
  jumpLevelsPerHourHigh: 15,
  // Legendary / unique issuance
  legendarySpikeMinCount: 4,
  legendarySpikeFactorMedium: 4,
  legendarySpikeFactorHigh: 8,
  legendaryAccountMedium: 3,
  legendaryAccountHigh: 6,
  // market
  outlierRatioMedium: 5,
  outlierRatioHigh: 20,
  pairSalesMedium: 3,
  pairSalesHigh: 6,
  pairOneWayMedium: 5,
  buyerPurchasesMedium: 8,
  buyerPurchasesHigh: 20,
  // referrals / waitlist
  ipClusterMedium: 5,
  ipClusterHigh: 12,
  subnetClusterMedium: 15,
  inviterMedium: 15,
  inviterHigh: 40,
  // payments
  reversalsMedium: 3,
  reversalsHigh: 8,
  paymentEventErrorsMedium: 3,
  paymentEventErrorsHigh: 10,
  unprocessedEventsHigh: 3,
  // function errors (5xx counted by the monitor)
  functionErrorsMedium: 10,
  functionErrorsHigh: 50,
} as const;

const label = (name: string | null): string | undefined => (name ? name : undefined);
const user = (id: string, name: string | null): Evidence => ({ type: 'user', id, label: label(name) });
const fmtX = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace('.', ',');
const pick = (n: number, medium: number, high: number): Severity | null => (n >= high ? 'high' : n >= medium ? 'medium' : null);

export function runPrechecks(agg: Aggregates): Signal[] {
  const out: Signal[] = [];
  const add = (s: Signal): void => {
    out.push(s);
  };
  const T = THRESHOLDS;

  // ---- anti-cheat ----
  const ac = agg.anticheat;
  if (ac.rejectedSnapshots >= T.rejectedSnapshotsMedium || ac.accountsWithNewFlags >= T.accountsWithNewFlagsMedium) {
    const sev = ac.accountsWithNewFlags >= T.accountsWithNewFlagsHigh ? 'high' : 'medium';
    const evidence: Evidence[] = [...ac.accounts.slice(0, 8).map((a) => user(a.user_id, a.username)), ...ac.reasonCounts.slice(0, 5).map((r): Evidence => ({ type: 'reason', id: r.reason }))];
    add({
      id: 'anticheat:snapshots',
      category: 'anticheat',
      severity: sev,
      summary: `${ac.accountsWithNewFlags} conta(s) com marcações novas de anti-trapaça na janela (${ac.flaggedSnapshots} marcadas, ${ac.rejectedSnapshots} rejeitadas).`,
      evidence,
    });
  }
  const itemSev = pick(ac.itemFlags.reduce((n, f) => n + f.count, 0), T.itemFlagsMedium, T.itemFlagsHigh);
  if (itemSev) {
    add({
      id: 'anticheat:items',
      category: 'anticheat',
      severity: itemSev,
      summary: `${ac.itemFlags.reduce((n, f) => n + f.count, 0)} marcação(ões) de autoridade de itens na janela.`,
      evidence: ac.itemFlags.slice(0, 6).map((f): Evidence => ({ type: 'code', id: f.code })),
    });
  }

  // ---- level / XP jumps ----
  for (const j of agg.levelJumps.top) {
    const gained = j.level_to - j.level_from;
    const hours = Math.max(j.minutes_between / 60, 1 / 6); // never divide by less than 10 minutes
    const perHour = gained / hours;
    const high = gained >= T.jumpLevelsHigh && perHour >= T.jumpLevelsPerHourHigh;
    const medium = gained >= T.jumpLevelsMedium && perHour >= T.jumpLevelsPerHourMedium;
    if (!high && !medium) continue;
    add({
      id: `level_jump:${j.user_id}`,
      category: 'level_jump',
      severity: high ? 'high' : 'medium',
      summary: `Uma conta subiu ${fmtX(gained)} nível(is) em ${fmtX(Math.round(j.minutes_between))} minuto(s) (${fmtX(Math.round(perHour * 10) / 10)} por hora; XP ${j.xp_from} -> ${j.xp_to}).`,
      evidence: [user(j.user_id, j.username)],
    });
  }

  // ---- Legendary / unique issuance ----
  const lg = agg.legendary;
  const expected = lg.baselinePerHour * agg.windowHours;
  if (lg.issuedInWindow >= T.legendarySpikeMinCount) {
    const factor = lg.issuedInWindow / Math.max(expected, 0.5);
    const sev = factor >= T.legendarySpikeFactorHigh ? 'high' : factor >= T.legendarySpikeFactorMedium ? 'medium' : null;
    if (sev) {
      add({
        id: 'legendary_spike:window',
        category: 'legendary_spike',
        severity: sev,
        summary: `${lg.issuedInWindow} Lendário(s)/único(s) emitidos na janela, contra ~${fmtX(Math.round(expected * 10) / 10)} esperados pela média dos 7 dias anteriores (${fmtX(Math.round(factor * 10) / 10)}x).`,
        evidence: [...lg.bySource.slice(0, 4).map((s): Evidence => ({ type: 'metric', id: `source:${s.source}`, label: `${s.count}` })), ...lg.topAccounts.slice(0, 5).map((a) => user(a.user_id, a.username))],
      });
    }
  }
  for (const a of lg.topAccounts) {
    const sev = pick(a.count, T.legendaryAccountMedium, T.legendaryAccountHigh);
    if (!sev) continue;
    add({ id: `legendary_spike:${a.user_id}`, category: 'legendary_spike', severity: sev, summary: `Uma conta recebeu ${a.count} Lendário(s)/único(s) na janela.`, evidence: [user(a.user_id, a.username)] });
  }

  // ---- market ----
  for (const o of agg.market.outliers) {
    const far = Math.max(o.ratio_to_median, o.ratio_to_median > 0 ? 1 / o.ratio_to_median : 0);
    const sev = pick(far, T.outlierRatioMedium, T.outlierRatioHigh);
    if (!sev) continue;
    add({
      id: `market_outlier:${o.sale_id}`,
      category: 'market_outlier',
      severity: sev,
      summary: `Venda a ${fmtX(o.ratio_to_median)}x a mediana de 30 dias do mesmo item (${o.median_samples} vendas de referência).`,
      evidence: [{ type: 'sale', id: o.sale_id, label: o.thing }, user(o.seller_id, o.seller_username), user(o.buyer_id, o.buyer_username)],
    });
  }
  for (const p of agg.market.pairs) {
    const wash = p.reciprocal && p.sales >= T.pairSalesMedium;
    const oneWay = !p.reciprocal && p.sales >= T.pairOneWayMedium;
    if (!wash && !oneWay) continue;
    const sev: Severity = p.sales >= T.pairSalesHigh && wash ? 'high' : 'medium';
    add({
      id: `market_wash:${p.seller_id}:${p.buyer_id}`,
      category: 'market_wash',
      severity: sev,
      summary: wash ? `Par de contas negociando nos dois sentidos: ${p.sales} vendas num sentido em ${agg.market.pairLookbackHours} h (padrão de lavagem de itens).` : `${p.sales} vendas do mesmo vendedor para o mesmo comprador em ${agg.market.pairLookbackHours} h.`,
      evidence: [user(p.seller_id, p.seller_username), user(p.buyer_id, p.buyer_username)],
    });
  }
  for (const b of agg.market.heavyBuyers) {
    const sev = pick(b.purchases, T.buyerPurchasesMedium, T.buyerPurchasesHigh);
    if (!sev) continue;
    add({
      id: `market_concentration:${b.buyer_id}`,
      category: 'market_concentration',
      severity: sev,
      summary: `Um comprador fez ${b.purchases} compras na janela, de ${b.distinct_sellers} vendedor(es) diferente(s).`,
      evidence: [user(b.buyer_id, b.buyer_username)],
    });
  }

  // ---- referrals (waitlist) ----
  for (const c of agg.referrals.ipClusters) {
    const sev = pick(c.signups, T.ipClusterMedium, T.ipClusterHigh);
    if (!sev) continue;
    add({ id: `referral_cluster:ip:${c.ip_prefix}`, category: 'referral_cluster', severity: sev, summary: `${c.signups} inscrições na lista de espera vindas do mesmo IP (hash) em ${agg.referrals.lookbackHours} h.`, evidence: [{ type: 'ip_prefix', id: c.ip_prefix }] });
  }
  for (const c of agg.referrals.subnetClusters) {
    if (c.signups < T.subnetClusterMedium) continue;
    add({ id: `referral_cluster:subnet:${c.subnet_prefix}`, category: 'referral_cluster', severity: 'medium', summary: `${c.signups} inscrições da mesma sub-rede (hash) em ${agg.referrals.lookbackHours} h.`, evidence: [{ type: 'subnet_prefix', id: c.subnet_prefix }] });
  }
  for (const i of agg.referrals.inviters) {
    const sev = pick(i.invited, T.inviterMedium, T.inviterHigh);
    if (!sev) continue;
    add({ id: `referral_cluster:inviter:${i.waitlist_id}`, category: 'referral_cluster', severity: sev, summary: `Um convidante trouxe ${i.invited} inscrições em ${agg.referrals.lookbackHours} h.`, evidence: [{ type: 'waitlist', id: i.waitlist_id }] });
  }

  // ---- payments ----
  const reversals = agg.payments.refunded + agg.payments.revokedDisputes;
  const revSev = pick(reversals, T.reversalsMedium, T.reversalsHigh);
  if (revSev) {
    add({ id: 'payments:reversals', category: 'payments', severity: revSev, summary: `${agg.payments.refunded} reembolso(s) e ${agg.payments.revokedDisputes} disputa(s) de Passe na janela.`, evidence: [{ type: 'metric', id: 'refunded', label: `${agg.payments.refunded}` }, { type: 'metric', id: 'disputes', label: `${agg.payments.revokedDisputes}` }] });
  }

  // ---- function errors ----
  for (const f of agg.errors.byFunction) {
    const sev = pick(f.errors, T.functionErrorsMedium, T.functionErrorsHigh);
    if (!sev) continue;
    add({ id: `errors:${f.function}`, category: 'errors', severity: sev, summary: `A função ${f.function} respondeu ${f.errors} erro(s) 5xx na janela.`, evidence: [{ type: 'function', id: f.function }] });
  }

  return out;
}

/** The highest severity among the signals ('info' when there are none). */
export const signalsSeverity = (signals: Signal[]): Severity => maxSeverity(signals.map((s) => s.severity));

/** Which signal categories justify which suggestion. A pause can only ever be suggested for a finding that rests on a signal of the matching area. */
export const PAUSE_JUSTIFIED_BY: Record<'pause_market' | 'pause_scoring', readonly Category[]> = {
  pause_market: ['market_outlier', 'market_wash', 'market_concentration', 'legendary_spike', 'payments', 'errors'],
  pause_scoring: ['anticheat', 'level_jump'],
};
