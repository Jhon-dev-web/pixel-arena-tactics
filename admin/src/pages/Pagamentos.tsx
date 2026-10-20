import { useState } from 'react';
import { DataTable, Pager, type Column } from '../components/Table';
import { Card, ExternalLink, Icon, Kpi, Notice, Pill, SectionTitle } from '../components/ui';
import { useApp, useAsync, useInterval } from '../hooks';
import { DASH, fmtAgo, fmtDateTime, fmtInt, lamportsToSol, shortAddress, shortId, solscanAccount, solscanTx } from '../lib/format';
import { exceptionReasonInfo, exceptionStatusLabel } from '../lib/labels';
import type { PaymentExceptionRow } from '../lib/types';

// "Pagamentos a resolver": every payment that reached the game's receiving wallet but could not be matched to a purchase (supabase/migrations/0022_payment_fixes.sql). READ ONLY. Resolving one is two lines of
// SQL the owner runs in the SQL editor; the page builds them with the signature already filled in (copy button), so nothing here writes anything.
const REFRESH_MS = 60_000;
const PAGE_SIZE = 50;

/** What reached the game, in the unit of its purpose: USDC (6 decimals) for the Pass, SOL for a sale. */
export function amountText(r: Pick<PaymentExceptionRow, 'purpose' | 'amount_units'>): string {
  if (r.purpose === 'pass') return `${(Number(r.amount_units) / 1_000_000).toFixed(2)} USDC`;
  return `${lamportsToSol(r.amount_units).toFixed(4)} SOL`;
}

export const grantSql = (signature: string): string => `select arena_private.payment_exception_grant_pass('${signature.replace(/[^1-9A-HJ-NP-Za-km-z]/g, '')}');`;
export const refundSql = (signature: string): string => `select arena_private.payment_exception_mark_refunded('${signature.replace(/[^1-9A-HJ-NP-Za-km-z]/g, '')}', '<assinatura da transação de devolução>');`;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState<boolean | null>(null);
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        setDone(await copy(text));
        window.setTimeout(() => setDone(null), 1800);
      }}
      title={text}
    >
      {done === true ? 'Copiado' : done === false ? 'Não foi possível copiar' : label}
    </button>
  );
}

const COLUMNS: Column<PaymentExceptionRow>[] = [
  { key: 'when', header: 'Quando', cell: (r) => <span title={fmtDateTime(r.created_at)}>{fmtAgo(r.created_at)}</span> },
  {
    key: 'who',
    header: 'Jogador',
    cell: (r) => (
      <span>
        {r.user_id ? <a href={`#/jogadores?q=${encodeURIComponent(r.user_id)}`}>{r.username ?? shortId(r.user_id)}</a> : DASH}
        {r.claimed_by.length > 0 ? <div className="faint">+{r.claimed_by.length} outro(s) enviaram esta assinatura</div> : null}
      </span>
    ),
  },
  { key: 'what', header: 'O quê', cell: (r) => (r.purpose === 'pass' ? 'Passe do Aventureiro' : 'Compra no mercado') },
  { key: 'amount', header: 'Chegou', align: 'num', cell: (r) => amountText(r) },
  {
    key: 'why',
    header: 'Por que não casou',
    cell: (r) => (
      <span>
        <Pill tone={exceptionReasonInfo(r.reason).tone}>{exceptionReasonInfo(r.reason).label}</Pill>
        <div className="faint">{exceptionReasonInfo(r.reason).hint}</div>
      </span>
    ),
  },
  {
    key: 'payer',
    header: 'Pagou com',
    cell: (r) => (
      <span>
        {r.payer_address ? (
          <ExternalLink href={solscanAccount(r.payer_address, r.livemode)} title={r.payer_address}>
            <span className="mono">{shortAddress(r.payer_address, 5, 5)}</span> ↗
          </ExternalLink>
        ) : (
          DASH
        )}
        {r.payer_address && r.linked_wallet ? (
          <div>{r.payer_address === r.linked_wallet ? <Pill tone="good">é a carteira ligada</Pill> : <Pill tone="warn">não é a ligada ({shortAddress(r.linked_wallet, 4, 4)})</Pill>}</div>
        ) : null}
      </span>
    ),
  },
  {
    key: 'tx',
    header: 'Transação (o código do jogador)',
    cell: (r) => (
      <ExternalLink href={solscanTx(r.signature, r.livemode)} title={r.signature}>
        <span className="mono">{shortAddress(r.signature, 6, 6)}</span> ↗
      </ExternalLink>
    ),
  },
  { key: 'net', header: 'Rede', cell: (r) => (r.livemode ? <Pill tone="good">real</Pill> : <Pill tone="warn">teste</Pill>) },
  {
    key: 'status',
    header: 'Estado',
    cell: (r) => (
      <span>
        <Pill tone={r.status === 'open' ? 'bad' : 'good'}>{exceptionStatusLabel(r.status)}</Pill>
        {r.resolution_ref ? <div className="faint mono">{shortAddress(r.resolution_ref, 6, 6)}</div> : null}
      </span>
    ),
  },
  {
    key: 'sql',
    header: 'Resolver',
    cell: (r) =>
      r.status !== 'open' ? (
        DASH
      ) : (
        <span className="row-actions">
          {r.purpose === 'pass' && r.user_id ? <CopyButton text={grantSql(r.signature)} label="Copiar SQL: conceder o Passe" /> : null}
          <CopyButton text={refundSql(r.signature)} label="Copiar SQL: marcar devolvido" />
        </span>
      ),
  },
];

const STATUS_TABS: { id: 'open' | 'resolved' | 'all'; label: string }[] = [
  { id: 'open', label: 'Em aberto' },
  { id: 'resolved', label: 'Resolvidos' },
  { id: 'all', label: 'Todos' },
];

export default function PagamentosPage() {
  const { demo } = useApp();
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open');
  const [page, setPage] = useState(0);
  const data = useAsync((a) => a.paymentExceptions({ status, page, pageSize: PAGE_SIZE }), [status, page]);
  useInterval(() => data.reload(), REFRESH_MS);
  const open = data.data?.open ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pagamentos a resolver</h1>
          <p>
            Pagamentos que chegaram na carteira de recebimento do jogo, foram conferidos na rede, mas não puderam ser ligados a uma compra (sem a referência, valor diferente, tarde demais, ou o jogador já tinha o Passe). Nenhum fica perdido: cada um aparece aqui com a
            transação.{demo ? ' (dados de demonstração)' : ''}
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn" onClick={() => data.reload()} disabled={data.loading}>
            <Icon name="refresh" />
            Atualizar
          </button>
        </div>
      </div>

      {data.error ? <Notice tone="bad">Não foi possível carregar: {data.error}</Notice> : null}
      {open !== null && open > 0 ? <Notice tone="warn">{open === 1 ? '1 pagamento espera por você.' : `${fmtInt(open)} pagamentos esperam por você.`} O jogador já viu o código dele na tela do Passe.</Notice> : null}

      <div className="kpis" style={{ margin: '12px 0' }}>
        <Kpi label="Em aberto" value={open === null ? '…' : fmtInt(open)} tone={open ? 'bad' : 'good'} sub="a resolver por você" />
        <Kpi label="Nesta lista" value={data.data ? fmtInt(data.data.total) : '…'} />
      </div>

      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Estado">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={status === t.id}
              onClick={() => {
                setStatus(t.id);
                setPage(0);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Card flush>
        <DataTable<PaymentExceptionRow> caption="Pagamentos a resolver" columns={COLUMNS} rows={data.data?.rows ?? []} rowKey={(r) => r.id} loading={data.loading} empty={status === 'open' ? 'Nenhum pagamento em aberto. Tudo certo.' : 'Nada para mostrar.'} />
        <Pager page={page} total={data.data?.total ?? 0} size={PAGE_SIZE} onPage={setPage} />
      </Card>

      <SectionTitle>Como resolver</SectionTitle>
      <Card>
        <ol className="how">
          <li>
            Abra a transação na Solscan (o link da coluna Transação) e confira quem pagou e quanto. Compare com a carteira ligada do jogador: se <strong>é a ligada</strong>, o pagamento é dele. Se não for, peça uma prova ao jogador antes (ele assina uma mensagem com a carteira que pagou).
          </li>
          <li>
            <strong>Conceder o Passe</strong> (o valor chegou e o pagamento é do jogador): no editor SQL do Supabase, como dono, rode o comando que o botão copia. Ele cria o Passe com origem «Concessão manual» e a assinatura como referência, e fecha a linha.
            <pre className="mono">{grantSql('ASSINATURA')}</pre>
          </li>
          <li>
            <strong>Devolver</strong> (valor errado, Passe duplicado, compra que não aconteceu): faça a devolução pela sua carteira e depois marque a linha com a assinatura da devolução.
            <pre className="mono">{refundSql('ASSINATURA')}</pre>
          </li>
          <li>Pagamentos de teste (rede «teste», devnet) não valem dinheiro; é só marcar como devolvido com qualquer assinatura de devolução válida ou deixar em aberto.</li>
        </ol>
        <p className="faint">Esta página só lê. Nada aqui concede, devolve ou altera sozinho.</p>
      </Card>
    </>
  );
}
