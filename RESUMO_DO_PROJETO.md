# Arena Idle — resumo do projeto

Atualizado em **29/10/2026**. Este é o documento de entrada para quem vai trabalhar no repositório, pessoa ou agente.

**Quando um documento discordar deste resumo, vale este resumo e o código** — nesta ordem: o código primeiro, depois este arquivo. Vários documentos em `docs/` são instantâneos de uma fase anterior e dizem isso no próprio cabeçalho; a seção 12 lista os que ainda enganam e em quê.

---

## 1. O que é

**Arena Idle** é um RPG idle em pixel art jogado **só no navegador**, computador ou celular. Não há versão Steam nem PC instalável.

O herói progride sozinho enquanto o jogador está fora: caça monstros, minera, corta madeira, cuida da horta, forja equipamentos e desce a masmorra. O jogador volta, recolhe, equipa e decide o próximo passo. A regra de desenho é **"não é um jogo para ficar assistindo"**: a Caça é uma cena pequena no mapa mais o inventário, e a arena com combate animado só aparece na Masmorra.

**Não existe classe escolhida.** A classe é o reflexo do que o herói veste: o peso da armadura (placa / couro / tecido) e a linha da arma (espada e machado / arco e besta / cajado e cetro) formam guerreiro, arqueiro e mago. Misturar sempre funciona; a afinidade é um bônus por combinar, nunca uma trava.

**Monetização:** o **Passe de Aventureiro** (US$ 10, pago só em USDC na rede Solana) e uma taxa de 5% no **mercado entre jogadores** (itens vendidos em SOL, sem custódia — o comprador paga direto à carteira do vendedor). Não há NFT nem token próprio: "NFT", na fala do dono, quer dizer mercado com pagamento em cripto.

**Não há data de lançamento.** A de 31/10 foi cancelada em 28/10, e o congelamento de conteúdo que existia por causa dela caiu junto.

---

## 2. Repositório

| Pasta | O que é |
|---|---|
| `src/` | O jogo (React 18 + Vite + TypeScript). Lógica em `src/game/`, telas em `src/components/`, casca em `src/shell/`, textos em `src/locales/pt.json` e `en.json` (**sempre manter os dois iguais em sentido**). |
| `public/assets/` | Sprites, ícones, fundos, músicas. Folhas de personagem são PNG em grade 4×4 (linhas: parado, ataque, dano, morte). |
| `supabase/migrations/` | Banco (Postgres). **38 migrações** no repositório, `0001` a `0038`. |
| `supabase/functions/` | 19 Edge Functions (Deno): progresso, materiais, itens, mercado, Passe em USDC, lista de espera, auditor de IA, vigia, admin. Código comum em `_shared/`. |
| `portal/` | Site público estático (`node scripts/build.mjs`). |
| `admin/` | Painel do dono, projeto separado. **Outra frente trabalha nele: não mexa.** |
| `scripts/sim/` | Simulações de economia, progressão e equilíbrio, e os geradores de tabela. |
| `docs/` | Documentos de projeto. Comece por `docs/cerebro/`. |
| `desktop/` | Electron herdado, parado. Continua no repositório e o portão `check:desktop` garante que o código de mercado não entra nesse pacote (a Valve proíbe negociação de cripto). Steam foi cancelada; ninguém publica isso. |

---

## 3. Como rodar e conferir

Node 22+. Na raiz:

- `npm run dev` — jogo local.
- **Os seis portões obrigatórios antes de qualquer commit:** `npx tsc -b --noEmit`, `npm test` (**162 arquivos, 4.335 testes**, ~36 s), `npx eslint .` (0 erros; 10 avisos antigos de `react-refresh` são esperados), `npm run build`, `npm run check:bundle`, `npm run check:desktop`.
- **Rode os portões numa cópia limpa de `HEAD`, não na árvore de trabalho.** Já aconteceu de `HEAD` não compilar com todos os portões verdes, porque arquivos ficaram sem commit. O passo a passo está em `docs/cerebro/ARMADILHAS.md` item 3.
- Simulações em `package.json` (`npm run sim:cp`, `sim:long`, e as de classe). **Não rebalanceie número sem pedido do dono.**
- Portal: em `portal/`, `npm run build`, `check`, `check:season`, `check:waitlist`.
- Admin: em `admin/`, `npm run build`, `npm test`.

---

## 4. O jogo, em uma página

- **Caça** (`src/game/huntingZones.ts`, `huntCombat.ts`) — a única fonte de materiais. 5 zonas, 3 profundidades, 10 sub-níveis cada. É onde o herói passa a maior parte do tempo.
- **Masmorra** (`BattleModal.tsx`) — 100 andares, com checkpoints e chefes. É o eixo do guerreiro e o desempate do campeonato.
- **Profissões** — Mineração, Lenhador, Horta, Ofícios. **Não dão XP de herói** (decisão do dono).
- **Forja** (`gear.ts`, `gearInstances.ts`) — 158 peças. O servidor sorteia raridade e certifica o item.
- **Táticas** (`abilities.ts`, `TaticasView.tsx`) — 21 habilidades concedidas pelo equipamento vestido. O jogador escolhe até 4 e a ordem; o combate usa a primeira pronta, de cima para baixo. **Peça de tier 0 não concede habilidade.**
- **Mercado** — itens épicos ou melhores, certificados pelo servidor, pagos em SOL.
- **Passe e Temporada** — `docs/SEASON_RANKING.md`.

O desenho completo está em [`docs/GDD.md`](docs/GDD.md). As classes e a reforma, com as medições, em [`docs/CLASSES_E_EQUIPAMENTOS.md`](docs/CLASSES_E_EQUIPAMENTOS.md). O catálogo de peças em [`docs/EQUIPAMENTOS.md`](docs/EQUIPAMENTOS.md), que é **gerado** por `scripts/sim/equipamentos.gen.ts`.

---

## 5. Equilíbrio: como ele é julgado hoje

Isto mudou em 28/10 e é a coisa mais fácil de desfazer por engano.

- **O poder de combate (CP) não decide mais nada.** Ele é termômetro: aparece na tela, no conselho de andar e no mercado. **Não é portão.**
- **Os dois portões da Caça** (sub-nível e profundidade) pedem **índice de equipamento** (`src/game/gearIndex.ts`): tier + refino + raridade, média sobre 7 slots, declarado e igual para as três classes. O CP era medido a partir dos stats e punia quem troca defesa por velocidade.
- **A justiça entre classes é medida por eixo**, não por CP: mago lidera a Caça, arqueiro lidera os chefes, guerreiro lidera a masmorra. Os alvos estão travados por `src/game/__tests__/classAxes.test.ts` nos tiers 6 e 4. **Se esse teste acender, o número é que está errado, não o teste.**
- O tier 3 está fora dos alvos **por decisão**, documentada.

---

## 6. Ambientes

| | Endereço fixo | Observação |
|---|---|---|
| Jogo (teste) | `https://arena-idle-teste.vercel.app` | **O único endereço autorizado nas funções.** |
| Painel (teste) | `https://arena-idle-admin-teste.vercel.app` | Outra frente. |
| Portal (teste) | `https://arena-idle-portal-teste.vercel.app` | |
| Supabase (teste) | projeto `ncufhkoyphktvmhmivxa` | Plano grátis. **Produção ainda não existe.** |

**Publicar é sempre dois passos**, e só o segundo vai para alguém:

```
npx vercel deploy --yes
npx vercel alias set <url-da-publicação> arena-idle-teste.vercel.app
```

A URL que o `deploy` imprime é **descartável** e não está em `APP_ORIGIN`: entregá-la a alguém faz o jogo dizer "Sem conexão com o servidor" com todas as funções saudáveis. O procedimento completo e o comando que confirma estão em [`docs/WEB_LAUNCH.md` §5.6](docs/WEB_LAUNCH.md) e em `docs/cerebro/ARMADILHAS.md` item 1.

**Republicar as funções** quando `supabase/functions/_shared/**` mudar — a função publicada carrega a cópia do `_shared` do momento do deploy. Confira contra o que está no ar (`supabase functions list` → `updated_at`), **nunca contra `git status`**.

**Claude não grava segredo no Supabase**: o dono põe no painel, e chave não se pede por chat.

---

## 7. Estado em 29/10/2026

**Banco de teste:** migrações `0001`–`0036` aplicadas. **`0037` (Top 25 do painel) e `0038` (tarefa do Discord) ainda não foram aplicadas** — dependem do dono.

**Funções:** oito republicadas em 29/10 (`bind-item`, `market-buy`, `market-list`, `market-my`, `material-claim`, `material-sync`, `mint-item`, `submit-progress`). **`ops-watchdog` e `ai-auditor` continuam de 21/10** e precisam de `--no-verify-jwt`, que o modo automático do Claude bloqueia: ficam para o dono. Enquanto isso a vigilância julga com limites antigos — quem **aplica** o limite é `submit-progress`, que está em dia, então jogador honesto não é barrado.

**A reforma de classes está fechada** (28–29/10): 84 peças novas, 6 linhas de arma, 3 pesos de armadura, habilidades por equipamento, tela de Táticas, afinidade, quinta zona de caça, e os dois portões convertidos para índice de equipamento.

**Pendente com o dono:**
- aplicar `0037` e `0038`;
- publicar `ops-watchdog` e `ai-auditor`;
- segredos do Discord e `SOL_USD_PRICE_URL`;
- produção: plano Pro do Supabase, carteira Solana real, domínio;
- textos legais (termos, regulamento da Liga com critério de desempate);
- prêmio do playtest: os 25 heróis de maior nível, **por mérito, nunca sorteio** (no Brasil, sorteio promocional exige autorização);
- preço do Passe da Temporada 2.

**Decisão grande em aberto:** o dono disse em 29/10 que está "quase refazendo este jogo" e enviou uma proposta de catálogo novo de habilidades (seis slots por build, maestria por família, ~90 habilidades). **Nada disso foi começado**, porque refazer o combate e terminar o que existe são trabalhos diferentes e ele ainda não escolheu.

---

## 8. Estudos (links externos)

- Estimativa de lançamento: https://claude.ai/artifact/12TuEjxi3sFxzE3SfQQxbZ
- Simulação de 100 jogadores: https://claude.ai/artifact/Fgd54HnWShtk3V5LfT4mPM
- Ordem das publicações no Discord/X: https://claude.ai/artifact/SbE4ibamScuFkfSWDeS4UC
- GDD em documento: https://claude.ai/artifact/9zXNjRn9msiWc8tqxy8u4S

---

## 9. Regras do dono

Estão em [`docs/cerebro/DECISOES_DO_DONO.md`](docs/cerebro/DECISOES_DO_DONO.md), com a data e o motivo de cada uma. **Leia antes de "consertar" qualquer coisa que pareça errada** — várias decisões dele parecem defeito para quem olha só o código.

As que mais pegam quem chega:
- o desempate do campeonato favorece o guerreiro **de propósito**;
- o bônus do evento do Alvo acumula acima do número do cartão **de propósito** (o texto é que foi corrigido);
- a ausência de Stripe e Pix é decisão, não lacuna.

---

## 10. Como trabalhar aqui

[`CLAUDE.md`](CLAUDE.md) tem o processo (diretor e executor, o que se pode fazer sem perguntar, o que é teste que vale a pena). [`AGENTS.md`](AGENTS.md) tem os portões.

O resumo do resumo: o dono escreve em português, lê no celular e costuma estar longe do computador. Resposta curta, resultado primeiro. Publicar no **ambiente de teste** é esperado; produção, dinheiro real e regra de jogo só com decisão dele.

---

## 11. Por onde começar a ler

1. [`AGENTS.md`](AGENTS.md) e [`CLAUDE.md`](CLAUDE.md) — como trabalhar e quais portões rodar.
2. [`docs/cerebro/`](docs/cerebro/) — decisões do dono, armadilhas e defeitos já pagos. **É a leitura que mais economiza tempo.**
3. Este arquivo.
4. [`docs/GDD.md`](docs/GDD.md) — o jogo como desenho.
5. [`docs/CLASSES_E_EQUIPAMENTOS.md`](docs/CLASSES_E_EQUIPAMENTOS.md) e [`docs/EQUIPAMENTOS.md`](docs/EQUIPAMENTOS.md).
6. No código: `src/game/tunables.ts`, `engine.ts`, `gear.ts`, `abilities.ts`, `huntingZones.ts`, `gearIndex.ts`, e o teste `src/game/__tests__/classAxes.test.ts`.
7. Sob demanda: `MARKET_SOLANA.md`, `SEASON_RANKING.md`, `WEB_LAUNCH.md`, `ADMIN.md`, `AI_OPS.md`. O histórico (`BALANCE_CHANGES.md`, `BALANCE_BASELINE.md`, `MATERIAL_FLOW.md`, `ECONOMY_AUDIT.md`) só para descobrir **por que** um número é o que é.

---

## 12. Documentos que ainda enganam

Auditados em 29/10. Ficaram porque o que descrevem ainda serve, mas leia com esta ressalva:

| Documento | O que nele está errado |
|---|---|
| `docs/ADMIN.md`, `docs/AI_OPS.md` | Cabeçalho diz "nada implantado" e há instruções de Stripe; as funções de Stripe foram apagadas. |
| `docs/MARKET_SOLANA.md`, `docs/MARKET_FOUNDATION.md` | Enquadramento de antes do servidor ser autoridade; menções a Steam e Stripe. |
| `docs/SEASON_RANKING.md` | Lista incompleta de fontes de Passe pago; a verdade é a migração `0025`. |
| `docs/WEB_LAUNCH.md` | A meta de Passes citada fora da §5.6 pode divergir da migração `0030`. |
| `docs/EVENT_CALENDAR.md` | Datas amarradas ao 31/10 cancelado. A tabela segue a migração `0035`. |
| `docs/INVENTORY.md` | §8 chama o mercado de "integração com a Steam". É Solana. |
| `docs/ECONOMIC_REFERENCE.md` | Afirma que não existe venda para NPC; existe mercador atacadista. |
| `docs/UI_REVIEW.md` | Instantâneo de 11–22/10; vários achados já foram consertados. |
| `docs/backend-phase1.md` | Enquadramento "o servidor guarda mas não é autoridade". Hoje ele sorteia, confere limite e certifica. Fica porque cinco arquivos de código apontam para ele. |

**Apagados em 29/10** por descreverem um jogo que não existe (duelo por turnos, save só no navegador, token ONE, Steam): `PROJECT/` (4 arquivos), `GAME_STATE.md`, `docs/DESKTOP_BUILD.md`, `docs/project-2d-rules.md`. Estão no histórico do git se alguém precisar.

**Achado de código, não de documento:** ainda existe código de Stripe em `supabase/functions/_shared/` (`checkout.ts`, `providers/stripe.ts`, `webhook.ts`) e testes que o cobrem, embora as Edge Functions `create-checkout` e `stripe-webhook` tenham sido apagadas. Está dormente. Se o dono quiser o Stripe realmente fora, é trabalho de código.
