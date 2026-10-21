// "Precisa de atenção": built ONLY from what the backend already returns (the overview, the payments queue, the AI-operations state). Pure, so it is tested.
// Rules: a source that has not answered is listed as NOT CHECKED (never as "nothing wrong"); two counts that look alike are kept apart and named for what they are; nothing here is a verdict about a player.
import { aggregateStatus } from './freshness';
import { fmtInt, fmtSol, fmtUsd } from './format';
import { FLAG_INFO, FLAG_ORDER } from './labels';
import type { OpsOverview, Overview, PaymentExceptionsPage } from './types';

export interface Source<T> {
  data: T | null;
  error: string | null;
}

export interface AttentionItem {
  id: string;
  tone: 'bad' | 'warn';
  title: string;
  detail: string;
  /** Hash link to the page (already filtered when the page supports it). */
  href?: string;
  linkLabel?: string;
}

export type SourceId = 'overview' | 'payments' | 'ops';

export interface Attention {
  items: AttentionItem[];
  /** Sources with no answer yet or a failed one: what was NOT checked. */
  unchecked: { id: SourceId; label: string; reason: 'loading' | 'failed' }[];
  /** Sources that answered. */
  checked: { id: SourceId; label: string }[];
}

const LABEL: Record<SourceId, string> = { overview: 'números do jogo', payments: 'pagamentos a resolver', ops: 'interruptores e incidentes' };

export function buildAttention(src: { overview: Source<Overview>; payments: Source<PaymentExceptionsPage>; ops: Source<OpsOverview> }, now: number): Attention {
  const items: AttentionItem[] = [];
  const unchecked: Attention['unchecked'] = [];
  const checked: Attention['checked'] = [];
  for (const id of ['overview', 'payments', 'ops'] as const) {
    const s = src[id];
    if (s.data) checked.push({ id, label: LABEL[id] });
    else unchecked.push({ id, label: LABEL[id], reason: s.error ? 'failed' : 'loading' });
  }

  const pay = src.payments.data;
  if (pay && pay.open > 0) {
    items.push({
      id: 'payments',
      tone: 'bad',
      title: pay.open === 1 ? '1 pagamento chegou e não casou com nenhuma compra' : `${fmtInt(pay.open)} pagamentos chegaram e não casaram com nenhuma compra`,
      detail: 'Fila «Pagamentos a resolver»: o dinheiro está na carteira do jogo e o jogador espera uma decisão sua.',
      href: '#/pagamentos',
      linkLabel: 'Abrir a fila',
    });
  }

  const ops = src.ops.data;
  if (ops) {
    const on = FLAG_ORDER.map((k) => ops.flags.find((f) => f.key === k)).filter((f) => f?.value);
    if (on.length > 0) {
      items.push({
        id: 'flags',
        tone: 'bad',
        title: on.length === 1 ? '1 pausa de segurança está ligada' : `${on.length} pausas de segurança estão ligadas`,
        detail: `${on.map((f) => FLAG_INFO[f!.key].label).join(', ')}. O vigia nunca desliga sozinho.`,
        href: '#/ia-operacao',
        linkLabel: 'Ver interruptores',
      });
    }
    if (ops.incidents.length > 0) {
      items.push({
        id: 'incidents',
        tone: 'bad',
        title: ops.incidents.length === 1 ? '1 incidente aberto do vigia' : `${ops.incidents.length} incidentes abertos do vigia`,
        detail: 'Falha repetida numa verificação automática. Marcar um relatório como lido não fecha o incidente.',
        href: '#/ia-operacao',
        linkLabel: 'Ver incidentes',
      });
    }
    if (ops.open_reports > 0) {
      items.push({
        id: 'reports',
        tone: 'warn',
        title: ops.open_reports === 1 ? '1 relatório da IA ainda não foi lido' : `${fmtInt(ops.open_reports)} relatórios da IA ainda não foram lidos`,
        detail: 'São conselhos, não decisões. Eles apontam evidências para você conferir.',
        href: '#/ia-operacao',
        linkLabel: 'Ler os relatórios',
      });
    }
  }

  const ov = src.overview.data;
  if (ov) {
    if (ov.league.players_with_open_flags > 0) {
      items.push({
        id: 'progress-flags',
        tone: 'warn',
        title: `${fmtInt(ov.league.players_with_open_flags)} ${ov.league.players_with_open_flags === 1 ? 'jogador com alerta de progresso aberto' : 'jogadores com alerta de progresso aberto'}`,
        detail: 'O servidor achou o progresso estranho. É um sinal para investigar, não uma culpa provada.',
        href: '#/liga',
        linkLabel: 'Abrir a fila da Liga',
      });
    }
    if (ov.league.players_with_item_flags > 0) {
      items.push({
        id: 'item-flags',
        tone: 'warn',
        title: `${fmtInt(ov.league.players_with_item_flags)} ${ov.league.players_with_item_flags === 1 ? 'conta com alerta de itens' : 'contas com alerta de itens'}`,
        detail: 'Itens com origem a conferir. Investigue antes de concluir qualquer coisa.',
        href: '#/jogadores?alertas=1',
        linkLabel: 'Ver as contas',
      });
    }
    const refundSol = Number(ov.market.refund_due_lamports) || 0;
    const refundUsdc = Number(ov.pass.usdc_to_refund) || 0;
    if (ov.market.refund_due_count > 0 || refundUsdc > 0) {
      const parts = [ov.market.refund_due_count > 0 ? `${fmtInt(ov.market.refund_due_count)} no mercado (${fmtSol(refundSol)})` : null, refundUsdc > 0 ? `${fmtUsd(refundUsdc)} em USDC de Passes` : null].filter(Boolean);
      items.push({
        id: 'refund-due',
        tone: 'warn',
        title: 'Pagamentos já conferidos marcados para devolução',
        detail: `${parts.join(' · ')}. Esta contagem é de outra tabela, diferente da fila «Pagamentos a resolver».`,
      });
    }
    const agg = aggregateStatus(ov.freshness, now);
    if (agg.cache.state !== 'fresh') {
      items.push({
        id: 'stale-cache',
        tone: 'warn',
        title: agg.cache.state === 'never' ? 'A rotina de agregados nunca rodou' : 'Os dados agregados estão atrasados',
        detail: 'Nível, andar, profundeza e ouro dos jogadores vêm dessa rotina e podem estar velhos ou vazios. Ela deveria rodar a cada 6 horas (docs/ADMIN.md, seção 4).',
      });
    }
    if (agg.daily.state !== 'fresh') {
      items.push({
        id: 'stale-daily',
        tone: 'warn',
        title: agg.daily.state === 'never' ? 'A rotina diária nunca rodou' : 'A rotina diária está atrasada',
        detail: 'A série de jogadores ativos por dia depende dela. Ela deveria rodar a cada 15 minutos.',
      });
    }
  }
  return { items, unchecked, checked };
}
