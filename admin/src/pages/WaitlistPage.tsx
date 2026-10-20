import { useState } from 'react';
import { BarChart } from '../components/Charts';
import { DataTable, type Column } from '../components/Table';
import { Bars, Card, Field, Kpi, Notice, SectionTitle, Skeleton } from '../components/ui';
import { useAsync } from '../hooks';
import { csvFilename, downloadCsv, toCsv } from '../lib/csv';
import { fmtDate, fmtDay, fmtInt, fmtPercent } from '../lib/format';
import type { Waitlist } from '../lib/types';
import { Icon } from '../components/ui';

type Referrer = Waitlist['top_referrers'][number];

const REFERRER_COLUMNS: Column<Referrer>[] = [
  { key: 'c', header: 'Código', cell: (r) => <span className="mono">{r.ref_code}</span> },
  { key: 'e', header: 'E-mail', cell: (r) => <span className="mono">{r.email_masked}</span> },
  { key: 'i', header: 'Convidados', align: 'num', cell: (r) => fmtInt(r.invited) },
  { key: 'q', header: 'Qualificados', align: 'num', cell: (r) => fmtInt(r.qualified) },
  { key: 'r', header: 'Taxa', align: 'num', cell: (r) => fmtPercent(r.invited ? r.qualified / r.invited : 0) },
  { key: 's', header: 'Na lista desde', cell: (r) => fmtDate(r.since) },
];

const IGNORED_LABEL: Record<string, string> = { unknown_code: 'código desconhecido', self_email: 'o próprio e-mail', self_ip: 'o mesmo IP do convidante' };

export default function WaitlistPage() {
  const [days, setDays] = useState(30);
  const w = useAsync((api) => api.waitlist(days), [days]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lista de espera</h1>
          <p>Quem se cadastrou antes do lançamento, de onde vieram e quem mais indicou amigos. E-mails aparecem mascarados.</p>
        </div>
        <div className="head-actions">
          <Field label="Período">
            <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>7 dias</option>
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
              <option value={365}>1 ano</option>
            </select>
          </Field>
          {w.data ? (
            <button
              type="button"
              className="btn"
              onClick={() => downloadCsv(csvFilename('espera-referenciadores'), toCsv(['codigo', 'email_mascarado', 'convidados', 'qualificados', 'desde'], w.data!.top_referrers.map((r) => [r.ref_code, r.email_masked, r.invited, r.qualified, r.since])))}
            >
              <Icon name="download" />
              Exportar CSV
            </button>
          ) : null}
        </div>
      </div>
      {w.error ? <Notice tone="bad">Não foi possível carregar: {w.error}</Notice> : null}
      {!w.data ? <Skeleton height={240} /> : <Body w={w.data} />}
    </>
  );
}

function Body({ w }: { w: Waitlist }) {
  const t = w.totals;
  const periodTotal = w.by_day.reduce((a, d) => a + d.count, 0);
  return (
    <>
      <div className="kpis">
        <Kpi label="Na lista" value={fmtInt(t.total)} sub={`${fmtInt(t.active)} ativos · ${fmtInt(t.unsubscribed)} saíram`} />
        <Kpi label={`Entraram em ${w.days} dias`} value={fmtInt(periodTotal)} sub={`média de ${fmtInt(periodTotal / Math.max(1, w.days))} por dia`} />
        <Kpi label="Chegaram por indicação" value={fmtInt(t.referred)} sub={`${fmtPercent(t.total ? t.referred / t.total : 0)} da lista`} />
        <Kpi label="Indicados qualificados" value={fmtInt(t.qualified)} sub="já têm conta e nível mínimo" />
        <Kpi label="Já criaram conta" value={fmtInt(t.registered_in_game)} sub={`${fmtPercent(t.total ? t.registered_in_game / t.total : 0)} da lista`} />
        <Kpi label="Convites no jogo" value={fmtInt(t.account_referred ?? 0)} sub={`${fmtInt(t.account_qualified ?? 0)} qualificados`} />
        <Kpi label="Idioma" value={`${fmtInt(t.locale_pt)} pt`} sub={`${fmtInt(t.locale_en)} en`} />
      </div>

      <SectionTitle>Por dia</SectionTitle>
      <Card title={`Cadastros por dia — ${w.days} dias`}>
        <BarChart label="Cadastros na lista de espera por dia" labels={w.by_day.map((d) => fmtDay(d.day))} axis={fmtInt} tip={fmtInt} series={[{ name: 'Cadastros', tone: 1, values: w.by_day.map((d) => d.count) }]} />
      </Card>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <Card title="Por origem" note="utm_source ou site de origem">
          <Bars rows={w.by_source.slice(0, 12).map((s, i) => ({ label: s.source, value: s.count, tone: ((i % 6) + 1) as 1 }))} format={fmtInt} />
        </Card>
        <Card title="Indicações ignoradas" note="por que um link de convite não contou">
          {w.referral_ignored.length === 0 ? <p className="muted">Nenhuma.</p> : <Bars rows={w.referral_ignored.map((s, i) => ({ label: IGNORED_LABEL[s.referral_ignored] ?? s.referral_ignored, value: s.count, tone: ((i % 6) + 1) as 1 }))} format={fmtInt} />}
        </Card>
      </div>

      <SectionTitle>Quem mais indicou</SectionTitle>
      <Card flush>
        <DataTable caption="Quem mais indicou amigos" columns={REFERRER_COLUMNS} rows={w.top_referrers} rowKey={(r) => r.ref_code} empty="Ninguém indicou amigos ainda." />
      </Card>
    </>
  );
}
