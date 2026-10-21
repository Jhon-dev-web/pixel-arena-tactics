// Reading and describing the live account object (admin_player_full, migration 0034). Pure functions: no React, no network.
import { DASH, fmtInt, humanize } from './format';
import type { CountMap, FullCredit, FullGear, PlayerFull } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = <T extends object>(v: unknown): T => (isObj(v) ? (v as T) : ({} as T));

/**
 * The database answer, made safe to render: a missing list becomes [], a missing map becomes {}, so a drawer never crashes on a partial answer (an older function, a save with odd types).
 * Returns null when there is no object (an unknown account).
 */
export function normalizeFull(raw: unknown): PlayerFull | null {
  if (!isObj(raw)) return null;
  const r = raw as Record<string, any>;
  const s = isObj(r.save) ? (r.save as Record<string, any>) : null;
  const market = obj<Record<string, any>>(r.market);
  const invites = obj<Record<string, any>>(r.invites);
  const progress = obj<Record<string, any>>(r.progress);
  const credits = obj<Record<string, any>>(r.credits);
  return {
    generated_at: String(r.generated_at ?? ''),
    has_character: r.has_character === true,
    save: s
      ? ({
          ...s,
          professions: arr(s.professions),
          gear: arr(s.gear),
          equipped: obj(s.equipped),
          inventory: obj(s.inventory),
          materials: obj(s.materials),
          tradeable_materials: obj(s.tradeable_materials),
          potions: obj(s.potions),
          consumables: obj(s.consumables),
          gems: obj(s.gems),
          cosmetics: arr(s.cosmetics),
          attributes: obj(s.attributes),
          counters: { ...obj<Record<string, unknown>>(s.counters), forged_by_rarity: obj(obj<Record<string, any>>(s.counters).forged_by_rarity) },
          hunting: { ...obj<Record<string, unknown>>(s.hunting), unlocked_zones: arr(obj<Record<string, any>>(s.hunting).unlocked_zones), progress: obj(obj<Record<string, any>>(s.hunting).progress) },
          dungeon: { ...obj<Record<string, unknown>>(s.dungeon), checkpoints: arr(obj<Record<string, any>>(s.dungeon).checkpoints) },
          skill_tree: { ...obj<Record<string, unknown>>(s.skill_tree), sets: arr(obj<Record<string, any>>(s.skill_tree).sets), spent: arr(obj<Record<string, any>>(s.skill_tree).spent), respec_used: obj<Record<string, any>>(s.skill_tree).respec_used === true },
          stash: { ...obj<Record<string, unknown>>(s.stash), materials: obj(obj<Record<string, any>>(s.stash).materials), consumables: obj(obj<Record<string, any>>(s.stash).consumables), gear: obj(obj<Record<string, any>>(s.stash).gear) },
          pass: { ...obj<Record<string, unknown>>(s.pass), has_flag: obj<Record<string, any>>(s.pass).has_flag === true, claimed_free: arr(obj<Record<string, any>>(s.pass).claimed_free), claimed_premium: arr(obj<Record<string, any>>(s.pass).claimed_premium) },
        } as unknown as PlayerFull['save'])
      : null,
    progress: { latest_verdict: progress.latest_verdict ?? null, counts: { ok: 0, flagged: 0, rejected: 0, total: 0, ...obj<object>(progress.counts) }, snapshots: arr(progress.snapshots) },
    credits: { unclaimed: Number(credits.unclaimed ?? 0), claimed: Number(credits.claimed ?? 0), rows: arr(credits.rows) },
    promo: arr(r.promo),
    market: {
      listing_counts: obj(market.listing_counts),
      listings: arr(market.listings),
      reservations: arr(market.reservations),
      sold: { count: 0, lamports: 0, ...obj<object>(market.sold) },
      bought: { count: 0, lamports: 0, ...obj<object>(market.bought) },
    },
    invites: {
      code: invites.code ?? null,
      invited_by: isObj(invites.invited_by) ? (invites.invited_by as PlayerFull['invites']['invited_by']) : null,
      invited_total: Number(invites.invited_total ?? 0),
      invited_qualified: Number(invites.invited_qualified ?? 0),
      invited_ignored: Number(invites.invited_ignored ?? 0),
      invited: arr(invites.invited),
      rewards: arr(invites.rewards),
    },
    waitlist: isObj(r.waitlist) ? (r.waitlist as PlayerFull['waitlist']) : null,
    audit: arr(r.audit),
  };
}

/** Entries of a { id: count } map with a positive count, biggest first (ties by id). Garbage values are dropped. */
export function countEntries(m: CountMap | null | undefined): [string, number][] {
  return Object.entries(m ?? {})
    .filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export const sumCounts = (m: CountMap | null | undefined): number => countEntries(m).reduce((t, [, n]) => t + n, 0);

/** "Ferro ×120 · Carvalho ×10", or "nenhum" for an empty map. */
export function countsLine(m: CountMap | null | undefined): string {
  const e = countEntries(m);
  return e.length ? e.map(([id, n]) => `${humanize(id)} ×${fmtInt(n)}`).join(' · ') : 'nenhum';
}

export interface RarityTally {
  common: number;
  rare: number;
  epic: number;
  legendary: number;
}

export function rarityTally(gear: FullGear[]): RarityTally {
  const t: RarityTally = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const g of gear) if (g.rarity === 'common' || g.rarity === 'rare' || g.rarity === 'epic' || g.rarity === 'legendary') t[g.rarity]++;
  return t;
}

export const wornGear = (gear: FullGear[]): FullGear[] => gear.filter((g) => g.equipped_slot);
export const bagGear = (gear: FullGear[]): FullGear[] => gear.filter((g) => !g.equipped_slot);

/** "+5 · durabilidade 80 · 1 reforja · 1 engaste" for one piece. */
export function gearDetails(g: FullGear): string {
  const parts: string[] = [];
  if (g.upgrade != null) parts.push(`+${fmtInt(g.upgrade)}`);
  if (g.durability != null) parts.push(`durabilidade ${fmtInt(g.durability)}`);
  if (g.reforge_count) parts.push(`${fmtInt(g.reforge_count)} reforja${g.reforge_count === 1 ? '' : 's'}`);
  if (g.sockets.length) parts.push(`engastes: ${g.sockets.map(humanize).join(', ')}`);
  if (g.substats.length) parts.push(`${g.substats.length} atributo${g.substats.length === 1 ? '' : 's'} extra${g.substats.length === 1 ? '' : 's'}`);
  return parts.join(' · ') || DASH;
}

export const PROFESSION_LABEL: Record<string, string> = { mining: 'Mineração', woodcutting: 'Lenhador', gardening: 'Jardinagem' };

/** "3h 20min" / "45 min" / "2 d 4 h" from a number of seconds; "—" when unknown. */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return DASH;
  const s = Math.floor(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`;
}

export const CREDIT_SOURCE_LABEL: Record<string, string> = { promo: 'Código promocional', pioneer: 'Kit Pioneiro' };

/** "500 de Ouro" / "88 de Éter" / "10 × Small hp". */
export function creditLabel(c: Pick<FullCredit, 'kind' | 'item_id' | 'amount'>): string {
  if (c.kind === 'gold') return `${fmtInt(c.amount)} de Ouro`;
  if (c.kind === 'shards') return `${fmtInt(c.amount)} de Éter`;
  return `${fmtInt(c.amount)} × ${humanize(c.item_id)}`;
}

/** The same for a promo code row (reward_kind 'pass' has no amount). */
export function promoRewardLabel(p: { reward_kind: string | null; reward_item_id: string | null; reward_amount: number | null }): string {
  if (p.reward_kind === 'pass') return 'Passe da temporada';
  if (p.reward_kind === 'gold' || p.reward_kind === 'shards' || p.reward_kind === 'consumable') return creditLabel({ kind: p.reward_kind, item_id: p.reward_item_id, amount: p.reward_amount ?? 0 });
  return DASH;
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  grant_pass: 'Passe concedido',
  revoke_pass: 'Passe revogado',
  delete_user_blocked: 'Exclusão bloqueada',
  delete_user: 'Conta excluída',
  create_promo_codes: 'Códigos promocionais criados',
  disable_promo_code: 'Código desativado',
};
export const auditActionLabel = (a: string): string => AUDIT_ACTION_LABEL[a] ?? humanize(a);

/** The save says Pass, the server says no (or the other way round): a thing the owner should see. Null when they agree or the Pass state is unknown. */
export function passMismatch(saveFlag: boolean | null | undefined, serverValidNow: boolean | null | undefined): string | null {
  if (saveFlag == null || serverValidNow == null) return null;
  if (saveFlag && !serverValidNow) return 'O save diz que tem o Passe, mas o servidor não reconhece Passe válido nesta temporada.';
  if (!saveFlag && serverValidNow) return 'O servidor reconhece o Passe, mas o save ainda não marcou (o jogo marca ao abrir).';
  return null;
}

/** Hunting depth and zone as a sentence. */
export function huntingLine(h: { zone: string | null; depth: number | string | null }): string {
  if (!h.zone) return 'sem caça ativa';
  return `${humanize(h.zone)}${h.depth != null ? ` · profundeza ${String(h.depth)}` : ''}`;
}
