// The dashboard's ACTIONS (migration 0027, docs/ADMIN.md "Ações do painel"): delete an account, grant / revoke the Pass, promo codes. Every one is admin-only in the database, audited, and confirmed in the UI first.
// This file holds the types, the pure helpers and the Portuguese wording; the calls themselves are in api.ts (RPC) and backend.ts (the Edge Function).

/** Why the delete function said no. 'blocked' = a foreign key the database protects (market history); 'session' = the token was refused before the function ran. */
export type DeleteRefusal = 'ADMIN_ONLY' | 'ADMIN_DELETE_SELF' | 'ADMIN_DELETE_ADMIN' | 'USER_NOT_FOUND' | 'CONFIRM_MISMATCH' | 'blocked' | 'session' | 'unavailable' | 'failed';

export type DeleteUserResult = { ok: true; username: string | null } | { ok: false; reason: DeleteRefusal; constraint?: string | null; table?: string | null };

const KNOWN_REFUSALS: readonly string[] = ['ADMIN_ONLY', 'ADMIN_DELETE_SELF', 'ADMIN_DELETE_ADMIN', 'USER_NOT_FOUND', 'CONFIRM_MISMATCH'];

/** Maps the answer of the admin-delete-user function (its HTTP status and JSON body) to a result the UI can show. Anything unexpected is 'failed': never "ok" by accident. */
export function parseDeleteResponse(status: number, body: unknown): DeleteUserResult {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (status === 200 && b.ok === true) return { ok: true, username: typeof b.username === 'string' ? b.username : null };
  if (b.error === 'refused' && typeof b.reason === 'string' && KNOWN_REFUSALS.includes(b.reason)) return { ok: false, reason: b.reason as DeleteRefusal };
  if (b.error === 'blocked') return { ok: false, reason: 'blocked', constraint: typeof b.constraint === 'string' ? b.constraint : null, table: typeof b.table === 'string' ? b.table : null };
  if (status === 401) return { ok: false, reason: 'session' };
  if (status === 503 || b.error === 'unavailable') return { ok: false, reason: 'unavailable' };
  return { ok: false, reason: 'failed' };
}

export function deleteRefusalText(r: Extract<DeleteUserResult, { ok: false }>): string {
  switch (r.reason) {
    case 'ADMIN_ONLY':
      return 'O servidor recusou: esta conta não é de administrador.';
    case 'ADMIN_DELETE_SELF':
      return 'Você não pode apagar a própria conta por aqui.';
    case 'ADMIN_DELETE_ADMIN':
      return 'Esta conta é de administrador. Para apagá-la, primeiro tire-a da lista de administradores (SQL).';
    case 'USER_NOT_FOUND':
      return 'Conta não encontrada (talvez já tenha sido apagada).';
    case 'CONFIRM_MISMATCH':
      return 'O nome digitado não é o nome desta conta. Nada foi apagado.';
    case 'blocked':
      return `O banco protege o histórico desta conta (restrição ${r.constraint ?? 'desconhecida'}${r.table ? ` em ${r.table}` : ''}), então ela não pode ser apagada pelo painel. Nada foi apagado.`;
    case 'session':
      return 'Sua sessão expirou. Entre de novo e repita.';
    case 'unavailable':
      return 'A função de apagar contas não está disponível agora (não implantada ou sem a origem do painel configurada). Nada foi apagado.';
    default:
      return 'Não foi possível apagar a conta. Confira o registro de ações antes de tentar de novo.';
  }
}

/** What the player drawer asks the owner to type: the username, or the hero name when there is no username (the database accepts either, and the e-mail for an account with neither). */
export function deleteConfirmName(p: { username: string | null; heroName: string | null; email: string | null }): string | null {
  return p.username?.trim() || p.heroName?.trim() || p.email?.trim() || null;
}

// ---- Grant / revoke the Pass (public.admin_grant_pass / admin_revoke_pass) ----------------------------------------------------------------------------------------------------

export const NOTE_MIN = 3;
export const NOTE_MAX = 300;

export interface GrantPassResult {
  status: 'granted' | 'already';
  season: number;
  entitlement_id?: string;
}

export interface RevokePassResult {
  status: 'revoked' | 'none';
  season: number;
  /** The sources of the Pass(es) taken away ('grant', 'stripe', ...). */
  sources?: string[];
}

/** Plain words for the errors the action functions raise. Anything else is shown as the server sent it. */
export function actionErrorText(message: string): string {
  if (/ADMIN_NOTE_REQUIRED/.test(message)) return `Escreva o motivo (pelo menos ${NOTE_MIN} letras). Ele fica registrado com o seu nome.`;
  if (/ADMIN_NOTE_TOO_LONG/.test(message)) return `O motivo é longo demais (no máximo ${NOTE_MAX} letras).`;
  if (/USER_NOT_FOUND/.test(message)) return 'Conta não encontrada (talvez já tenha sido apagada).';
  if (/ADMIN_ONLY/.test(message)) return 'O servidor recusou: esta conta não é de administrador.';
  return message;
}

// ---- Promo codes (public.admin_create_promo_codes / admin_list_promo_codes / admin_disable_promo_code) ----------------------------------------------------------------------

export type PromoStatus = 'active' | 'disabled' | 'expired' | 'exhausted';

export type PromoRewardKind = 'pass' | 'gold' | 'shards' | 'consumable';

export interface PromoCodeRow {
  code: string;
  reward_kind: PromoRewardKind;
  /** The potion for reward 'consumable', null otherwise. */
  reward_item_id: string | null;
  /** Gold / Éter / potion units; null for the Pass. */
  reward_amount: number | null;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
  created_by: string;
  note: string;
  last_redeemed_at: string | null;
  status: PromoStatus;
}

export interface CreatePromoArgs {
  count: number;
  reward: PromoRewardKind;
  /** The potion id, only with reward 'consumable'. */
  itemId?: string | null;
  /** Gold / Éter / potion units; not for the Pass. */
  amount?: number | null;
  maxUses: number;
  /** ISO moment, or null for a code that never expires. */
  expiresAt: string | null;
  note: string;
}

export const PROMO_COUNT_MAX = 500;
export const PROMO_USES_MAX = 100000;

/** "ABCDEFGHJK" -> "ABCDE-FGHJK" (easier to read aloud and to type; the game accepts it with or without the dash). */
export const formatPromoCode = (code: string): string => (code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code);

export const PROMO_REWARD_LABEL: Record<string, string> = { pass: 'Passe de Aventureiro', gold: 'Ouro', shards: 'Éter', consumable: 'Poção' };

/** The most one code may give (migration 0028 checks the same numbers): Ouro 1.000.000, Éter 10.000, poções 100 unidades. */
export const PROMO_AMOUNT_MAX: Record<Exclude<PromoRewardKind, 'pass'>, number> = { gold: 1_000_000, shards: 10_000, consumable: 100 };

/**
 * The potions a code may give: every consumable that is neither tradeable (the Gold Pouches: a code must not mint market goods) nor a Pass-track exclusive (Stash Deed, Forge Seal, Refine Catalyst, Expedition
 * Tickets). Same ids as arena_private.promo_consumable_ids() in migration 0028 (a test pins them) and as PROMO_CONSUMABLE_IDS in the game; the names are the game's Portuguese ones.
 */
export const PROMO_POTIONS: readonly { id: string; label: string }[] = [
  { id: 'small_hp', label: 'Poção de Vida Pequena' },
  { id: 'large_hp', label: 'Poção de Vida Grande' },
  { id: 'atk_elixir', label: 'Elixir de Batalha' },
  { id: 'knowledge_elixir', label: 'Elixir do Conhecimento' },
  { id: 'greater_elixir', label: 'Elixir de Vida Maior' },
  { id: 'strength_elixir', label: 'Elixir de Força' },
  { id: 'stoneskin_tonic', label: 'Tônico de Pele de Pedra' },
  { id: 'fortune_tonic', label: 'Tônico da Fortuna' },
  { id: 'haste_tonic', label: 'Tônico de Pressa' },
  { id: 'gatherer_brew', label: 'Poção do Coletor' },
  { id: 'precision_elixir', label: 'Elixir de Precisão' },
  { id: 'whetstone_oil', label: 'Óleo de Amolar' },
  { id: 'fertilizer', label: 'Adubo' },
  { id: 'repair_kit', label: 'Kit de Reparo' },
  { id: 'master_repair_kit', label: 'Kit de Reparo Mestre' },
  { id: 'sharpening_stone', label: 'Pedra de Amolar' },
  { id: 'armor_polish', label: 'Polimento de Armadura' },
  { id: 'hunter_lure', label: 'Isca do Caçador' },
  { id: 'prospector_tonic', label: 'Tônico do Prospector' },
];
export const promoPotionLabel = (id: string | null | undefined): string => PROMO_POTIONS.find((p) => p.id === id)?.label ?? id ?? '';

const brInt = (n: number): string => n.toLocaleString('pt-BR');

/** What a code gives, in words: "Passe de Aventureiro", "25.000 Ouro", "40 Éter", "12 × Elixir do Conhecimento". */
export function promoRewardText(r: { reward_kind: string; reward_item_id?: string | null; reward_amount?: number | null }): string {
  if (r.reward_kind === 'gold' && r.reward_amount) return `${brInt(r.reward_amount)} Ouro`;
  if (r.reward_kind === 'shards' && r.reward_amount) return `${brInt(r.reward_amount)} Éter`;
  if (r.reward_kind === 'consumable' && r.reward_amount) return `${brInt(r.reward_amount)} × ${promoPotionLabel(r.reward_item_id)}`;
  return promoRewardLabel(r.reward_kind);
}
export const promoRewardLabel = (k: string): string => PROMO_REWARD_LABEL[k] ?? k;

export const PROMO_STATUS_LABEL: Record<PromoStatus, string> = { active: 'Ativo', disabled: 'Desativado', expired: 'Expirado', exhausted: 'Esgotado' };

/** The end of a calendar day (local time) as an ISO moment, from the value of an <input type="date"> ("2026-11-30"). Empty or invalid -> null. A day in the past is returned as it is: the database refuses it. */
export function endOfDayIso(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Why a form is not ready, in plain words (null = ready). The database checks the same limits again. */
export function promoFormProblem(f: { count: number; maxUses: number; note: string; reward?: PromoRewardKind; itemId?: string | null; amount?: number }): string | null {
  if (!Number.isInteger(f.count) || f.count < 1 || f.count > PROMO_COUNT_MAX) return `A quantidade de códigos vai de 1 a ${PROMO_COUNT_MAX}.`;
  if (!Number.isInteger(f.maxUses) || f.maxUses < 1 || f.maxUses > PROMO_USES_MAX) return `Os usos por código vão de 1 a ${PROMO_USES_MAX}.`;
  if (f.reward && f.reward !== 'pass') {
    const max = PROMO_AMOUNT_MAX[f.reward];
    if (f.reward === 'consumable' && !PROMO_POTIONS.some((p) => p.id === f.itemId)) return 'Escolha qual poção o código dá.';
    if (!Number.isInteger(f.amount) || (f.amount ?? 0) < 1 || (f.amount ?? 0) > max) return `A quantidade vai de 1 a ${brInt(max)}.`;
  }
  if (f.note.trim().length < NOTE_MIN) return `Escreva uma nota (pelo menos ${NOTE_MIN} letras): ela mostra para que serve o lote.`;
  return null;
}

export function promoErrorText(message: string): string {
  if (/PROMO_BAD_COUNT/.test(message)) return `A quantidade de códigos vai de 1 a ${PROMO_COUNT_MAX}.`;
  if (/PROMO_BAD_MAX_USES/.test(message)) return `Os usos por código vão de 1 a ${PROMO_USES_MAX}.`;
  if (/PROMO_BAD_REWARD/.test(message)) return 'Recompensa desconhecida.';
  if (/PROMO_BAD_ITEM/.test(message)) return 'Essa poção não pode ser dada por código.';
  if (/PROMO_BAD_AMOUNT/.test(message)) return 'A quantidade da recompensa está fora do limite (Ouro até 1.000.000, Éter até 10.000, poções até 100).';
  if (/PROMO_BAD_EXPIRY/.test(message)) return 'A data de validade precisa estar no futuro.';
  if (/PROMO_NOT_FOUND/.test(message)) return 'Código não encontrado.';
  return actionErrorText(message);
}
