// Portuguese labels for the codes the database returns.
import type { OpsFlagKey, OpsSeverity } from './types';

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

// ---- AI operations ----

export const FLAG_ORDER: OpsFlagKey[] = ['maintenance_mode', 'market_paused', 'season_scoring_paused', 'pass_sales_paused'];

export const FLAG_INFO: Record<OpsFlagKey, { label: string; what: string }> = {
  maintenance_mode: { label: 'Modo manutenção', what: 'Mostra uma faixa de manutenção no topo do jogo para todo mundo. Não bloqueia nada sozinha.' },
  market_paused: { label: 'Mercado pausado', what: 'Ninguém consegue anunciar, reservar nem pagar no mercado. Cancelar um anúncio e ver o histórico continuam funcionando.' },
  season_scoring_paused: { label: 'Pontuação da Liga pausada', what: 'Os envios de progresso continuam sendo guardados e julgados, mas nenhum ponto entra no ranking.' },
  pass_sales_paused: { label: 'Vendas do Passe pausadas', what: 'Nenhum checkout novo (cartão ou USDC). O webhook do Stripe continua registrando pagamentos que já foram feitos.' },
};

export const SEVERITY_LABEL: Record<OpsSeverity, string> = { info: 'Informativo', low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
export const severityLabel = (s: string | null | undefined): string => (s ? (SEVERITY_LABEL[s as OpsSeverity] ?? s) : '—');
export const severityTone = (s: string | null | undefined): 'good' | 'info' | 'warn' | 'bad' | undefined => (s === 'critical' || s === 'high' ? 'bad' : s === 'medium' ? 'warn' : s === 'low' ? 'info' : undefined);

export const ACTION_LABEL: Record<string, string> = {
  review_account: 'Revisar a conta',
  watch: 'Continuar observando',
  pause_market: 'Considerar pausar o mercado',
  pause_scoring: 'Considerar pausar a pontuação da Liga',
  none: 'Nenhuma ação',
};
export const actionLabel = (a: string | null | undefined): string => (a ? (ACTION_LABEL[a] ?? a) : '—');

export const CHECK_LABEL: Record<string, string> = {
  db: 'Banco de dados',
  key_rpcs: 'Funções-chave do banco',
  market_path: 'Funções do mercado',
  payments_path: 'Pagamentos do Passe',
  progress_path: 'Envio de progresso',
  solana_rpc: 'Nó da Solana',
  stripe_backlog: 'Fila de eventos do Stripe',
};
export const checkLabel = (c: string | null | undefined): string => (c ? (CHECK_LABEL[c] ?? c) : '—');

export const CATEGORY_LABEL: Record<string, string> = {
  anticheat: 'Anti-trapaça',
  level_jump: 'Salto de nível',
  legendary_spike: 'Pico de Lendários',
  market_outlier: 'Preço fora do normal',
  market_wash: 'Vai e volta no mercado',
  market_concentration: 'Muitas compras de uma conta',
  referral_cluster: 'Indicações suspeitas',
  payments: 'Pagamentos',
  errors: 'Erros das funções',
};
export const categoryLabel = (c: string | null | undefined): string => (c ? (CATEGORY_LABEL[c] ?? c) : '—');

export const EVENT_KIND_LABEL: Record<string, string> = {
  health_check: 'Verificação',
  incident_opened: 'Incidente aberto',
  incident_reminder: 'Lembrete',
  incident_resolved: 'Incidente resolvido',
  flag_change: 'Flag alterada',
  alert_sent: 'Alerta enviado',
  alert_failed: 'Alerta falhou',
  ai_run: 'Execução da IA',
  report_ack: 'Relatório lido',
  note: 'Nota',
};
export const eventKindLabel = (k: string | null | undefined): string => (k ? (EVENT_KIND_LABEL[k] ?? k) : '—');

/** 'watchdog' -> "Vigia automático"; 'admin:<id>' -> "Administrador"; anything else as is. */
export function actorLabel(actor: string | null | undefined): string {
  if (!actor) return '—';
  if (actor === 'watchdog') return 'Vigia automático';
  if (actor === 'ai-auditor') return 'Auditor de IA';
  if (actor === 'migration') return 'Padrão';
  if (actor.startsWith('admin:')) return 'Administrador';
  return actor;
}

export const REPORT_KIND_LABEL: Record<string, string> = { anomaly: 'Anomalia', daily: 'Revisão diária', incident: 'Incidente' };
export const reportKindLabel = (k: string | null | undefined): string => (k ? (REPORT_KIND_LABEL[k] ?? k) : '—');
