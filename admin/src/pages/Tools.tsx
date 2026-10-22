import type { ReactNode } from 'react';
import { Icon, Pill, type IconName } from '../components/ui';
import { type AsyncState, useAsync } from '../hooks';
import { fmtInt } from '../lib/format';
import { FLAG_INFO, FLAG_ORDER } from '../lib/labels';

// "Ferramentas": everything in the panel that WRITES something (or hands the owner SQL to run) lives behind these four cards, apart from the screens that only show numbers.
// Each card says its state in one word and opens the full page that already existed. A query that fails says so: it never reads as "nothing to do".

type Tone = 'good' | 'warn' | 'bad' | 'info' | undefined;

function state<T>(a: AsyncState<T>, ok: (d: T) => { text: string; tone: Tone }): { text: string; tone: Tone } {
  if (a.data != null) return ok(a.data);
  return a.error ? { text: 'não foi possível consultar', tone: 'bad' } : { text: 'consultando…', tone: undefined };
}

function ToolCard({ href, icon, title, status, children }: { href: string; icon: IconName; title: string; status: { text: string; tone: Tone }; children: ReactNode }) {
  return (
    <a className="tool-card" href={href}>
      <span className="tool-icon">
        <Icon name={icon} />
      </span>
      <span className="tool-text">
        <span className="tool-title">
          <strong>{title}</strong>
          <Pill tone={status.tone}>{status.text}</Pill>
        </span>
        <span className="muted">{children}</span>
      </span>
      <span className="tool-go" aria-hidden="true">
        <Icon name="next" />
      </span>
    </a>
  );
}

export default function ToolsPage() {
  const pay = useAsync((api) => api.paymentExceptions({ status: 'open', page: 0, pageSize: 1 }), []);
  const codes = useAsync((api) => api.listPromoCodes(), []);
  const ops = useAsync((api) => api.opsOverview(), []);

  const payState = state(pay, (d) => (d.open > 0 ? { text: `${fmtInt(d.open)} em aberto`, tone: 'bad' } : { text: 'nada em aberto', tone: 'good' }));
  const codeState = state(codes, (d) => {
    const active = d.filter((c) => c.status === 'active').length;
    return { text: `${fmtInt(active)} ${active === 1 ? 'ativo' : 'ativos'}`, tone: undefined };
  });
  const flagState = state(ops, (d) => {
    const on = d.flags.filter((f) => f.value);
    return on.length ? { text: `${on.length} ${on.length === 1 ? 'pausa ligada' : 'pausas ligadas'}`, tone: 'warn' } : { text: 'nenhuma pausa', tone: 'good' };
  });
  const aiState = state(ops, (d) =>
    d.open_reports + d.incidents.length > 0 ? { text: `${fmtInt(d.open_reports)} não ${d.open_reports === 1 ? 'lido' : 'lidos'} · ${fmtInt(d.incidents.length)} ${d.incidents.length === 1 ? 'incidente' : 'incidentes'}`, tone: 'warn' } : { text: 'nada novo', tone: 'good' },
  );
  const paused = ops.data ? FLAG_ORDER.filter((k) => ops.data!.flags.find((f) => f.key === k)?.value).map((k) => FLAG_INFO[k].label) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ferramentas</h1>
          <p>Aqui ficam as ações que mudam alguma coisa. Cada uma pede confirmação e fica registrada com o seu nome.</p>
        </div>
      </div>
      <div className="tool-grid">
        <ToolCard href="#/pagamentos" icon="coin" title="Pagamentos a resolver" status={payState}>
          Pagamentos que chegaram sem uma compra correspondente. Os botões copiam o SQL para você rodar; o painel não executa nada sozinho.
        </ToolCard>
        <ToolCard href="#/premio-playtest" icon="league" title="Prêmio do playtest: Top 25 por nível" status={{ text: 'Passe sem sorteio', tone: 'info' }}>
          Os 25 heróis de nível mais alto, com a data em que chegaram (empate: quem chegou primeiro), e o botão para dar o Passe a cada um ou a todos de uma vez.
        </ToolCard>
        <ToolCard href="#/codigos" icon="ticket" title="Códigos promocionais" status={codeState}>
          Criar códigos de Passe, ouro, Éter ou poção, ver quantos foram usados e desativar.
        </ToolCard>
        <ToolCard href="#/ia-operacao" icon="shield" title="Interruptores de segurança" status={flagState}>
          {paused.length ? `Ligado agora: ${paused.join(', ')}.` : 'Pausar mercado, vendas do Passe, pontuação da Liga ou ligar o modo manutenção. Pede um motivo.'}
        </ToolCard>
        <ToolCard href="#/ia-operacao" icon="pulse" title="Vigia e relatórios da IA" status={aiState}>
          Incidentes do vigia, relatórios da IA e o custo do mês. “Marcar como lido” só registra que você leu.
        </ToolCard>
      </div>
    </>
  );
}
