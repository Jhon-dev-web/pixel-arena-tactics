// Portuguese labels for the codes the database returns.

export const PASS_SOURCE_LABEL: Record<string, string> = {
  stripe: 'Cartão (Stripe)',
  crypto_sol: 'USDC (Solana)',
  crypto_bsc: 'USDT (BSC, legado)',
  mercadopago: 'Mercado Pago',
  grant: 'Concessão manual',
  referral: 'Indicação',
};

export const passSourceLabel = (s: string | null | undefined): string => (s ? (PASS_SOURCE_LABEL[s] ?? s) : 'Sem Passe');

export const RARITY_LABEL: Record<string, string> = { common: 'Comum', rare: 'Raro', epic: 'Épico', legendary: 'Lendário' };
export const rarityLabel = (r: string | null | undefined): string => (r ? (RARITY_LABEL[r] ?? r) : '—');

export const KIND_LABEL: Record<string, string> = { gear: 'Equipamento', unique: 'Único', gold_pouch: 'Bolsa de Ouro' };
export const kindLabel = (k: string | null | undefined): string => (k ? (KIND_LABEL[k] ?? k) : '—');

export const SLOT_LABEL: Record<string, string> = { weapon: 'Arma', armor: 'Armadura', helmet: 'Elmo', boots: 'Botas', ring: 'Anel', shield: 'Escudo', amulet: 'Amuleto', gloves: 'Luvas', offhand: 'Mão secundária' };
export const slotLabel = (s: string | null | undefined): string => (s ? (SLOT_LABEL[s] ?? s) : '—');

export const SOURCE_LABEL: Record<string, string> = { forge: 'Forja', pity: 'Garantia (pity)', seal: 'Selo', drop: 'Caça (único)', boss: 'Chefe (único)' };
export const sourceLabel = (s: string | null | undefined): string => (s ? (SOURCE_LABEL[s] ?? s) : '—');

export const STATUS_LABEL: Record<string, string> = {
  held: 'Com o jogador',
  listed: 'À venda',
  sold: 'Vendido',
  bound: 'Vinculado',
  burned: 'Consumido',
  revoked: 'Revogado',
  transferred: 'Transferido',
  open: 'Aberto',
  reserved: 'Reservado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
};
export const statusLabel = (s: string | null | undefined): string => (s ? (STATUS_LABEL[s] ?? s) : '—');

export const SEASON_STATUS_LABEL: Record<string, string> = { upcoming: 'Aguardando', open: 'Aberta', frozen: 'Congelada', closed: 'Encerrada', paid: 'Paga' };
export const seasonStatusLabel = (s: string | null | undefined): string => (s ? (SEASON_STATUS_LABEL[s] ?? s) : '—');

export const VERDICT_LABEL: Record<string, string> = { ok: 'ok', flagged: 'sinalizado', rejected: 'rejeitado' };

/** Where a pouch / item row of the economy page sits, in order. */
export const ITEM_STATUS_ORDER = ['held', 'listed', 'transferred', 'burned', 'revoked'] as const;
