# Os seis portões

Voltar: [[Comece aqui]] · Ligações: [[Guardas que existem]] · [[Ferramentas de medição]] · [[Os portões verdes podem estar mentindo]] · [[Testes que passam só na sua máquina (fim de linha)]]

Os seis comandos que têm de passar antes de **qualquer** commit, na raiz do repositório (`AGENTS.md`, `RESUMO_DO_PROJETO.md` seção 3):

| # | Comando | O que pega |
|---|---|---|
| 1 | `npx tsc -b --noEmit` | erro de tipo; o que não compila num clone limpo |
| 2 | `npm test` | a suíte inteira (jogo e funções). Cerca de 36 s; `CLAUDE.md` seção 3 diz que não há motivo para rodar menos que ela |
| 3 | `npx eslint .` | 0 erros. Os 10 avisos antigos de `react-refresh` são esperados; três deles em `useEffect` de `App.tsx` merecem um comentário (revisão de 29/10) |
| 4 | `npm run build` | o build de produção do Vite |
| 5 | `npm run check:bundle` | falha se o build de produção carrega ferramenta de desenvolvedor. Constrói duas vezes: produção, que **não** pode conter nenhum marcador de DEV, e um controle com `DEV` forçado, que **tem** de conter todos. O controle prova que cada marcador ainda existe no código; sem ele uma troca de minificador viraria um teste que nunca falha |
| 6 | `npm run check:desktop` | falha se o pacote desktop carrega qualquer parte do mercado (a Valve proíbe negociação de cripto). Mesma estratégia: build desktop sem marcadores e build web de controle com todos |

Para `portal/`: em `portal/`, `npm run build`, `check`, `check:season`, `check:waitlist`. Para `admin/`: `npm run build`, `npm test` (outra frente, **não mexa**). Em `RESUMO_DO_PROJETO.md` seção 3.

## Como rodar para valer

**Numa cópia limpa de `HEAD`, não na árvore de trabalho.** Já aconteceu de `HEAD` não compilar com todos os portões verdes ([[2026-10-29 — Metade de uma funcionalidade publicada e não commitada]]). O passo a passo está em [[Os portões verdes podem estar mentindo]]. A mesma conferência achou dois testes que só passavam com LF ([[2026-10-29 — Dois testes que só passavam com fim de linha LF]]).

## Atalhos que existem (e o preço)

- `SKIP_BUNDLE_CHECK=1` pula as duas construções do `bundleDevCode.test.ts` e do teste de bundle em `marketWiring.test.ts` (cerca de 10 s). **Só para iterar em algo alheio**: o portão 5 e o 6 continuam sendo os que valem.
- `HONEST_SEEDS` e `HONEST_DAYS` **alargam** `honestPlayerAntifraud.test.ts` quando se está re-medindo um limite do servidor ([[Guardas que existem]]).
- Testes de balanço e as ferramentas **não** estão em `npm test`: ficam em `vitest.sim.config.ts` ([[Ferramentas de medição]]).

## A regra de ouro dos portões de equilíbrio

Quando um guarda de equilíbrio ou de economia acende, **o número é que está errado, não o teste**. Afrouxar o teste para passar é o jeito mais rápido de perder a rede inteira (`CLAUDE.md` seção 3). Isto vale para `classAxes`, `itemBalance`, `zoneLevelGates`, `honestPlayerAntifraud` e os espelhos de tabela do servidor. Ver [[Guardas que existem]] para o que cada um faz se acender.

Também não se regrava `abilitiesGolden.json`: ele é a prova de que o motor não mudou sozinho ([[Teste que depende da data de hoje]]).

## Estado medido em 29/10/2026 (`docs/REVISAO_2026-10-29.md`)

Todos os seis passaram; 162 arquivos e 4.335 testes (2 `todo`) em cerca de 37 s. Isto é um instantâneo: o número muda com cada commit, o `RESUMO_DO_PROJETO.md` é a fonte.
