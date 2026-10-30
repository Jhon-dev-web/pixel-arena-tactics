# O que está em aberto

Voltar: [[Comece aqui]] · Ligações: [[Decisões do dono]] · [[Classes e equipamento]] · [[Antifraude e temporada]] · [[Economia e materiais]] · [[Caça e masmorra]]

Lista montada em 29–30/10/2026 a partir do `RESUMO_DO_PROJETO.md` (seção 7), dos documentos de `docs/` datados de 29/10 e dos commits desses dias. **Este cofre não sabe o que mudou depois.** Cada item diz de onde veio; confira a fonte antes de agir. O que **ele** precisa decidir está separado do que é trabalho já permitido sem perguntar (`CLAUDE.md` seção 4).

## Com o dono (decisão ou ação que só ele faz)

**No banco e nas funções**
- Aplicar as migrações `0037` (Top 25 do painel) e `0038` (tarefa do Discord); `RESUMO` seção 7. Banco de teste só tinha até a `0036`.
- Publicar `ops-watchdog` e `ai-auditor` com `--no-verify-jwt` (o modo automático do Claude bloqueia). Enquanto isso a vigilância julga com limites antigos.
- **Republicar as funções depois de cada mudança em `_shared`.** Estas mensagens de commit dizem que precisam: a de materiais (fio de linho e algodão, `e63c6e9`) e o limite de XP do Adubo (`3ac1563`, `bounds.ts` ainda em 80 nas funções publicadas até então). `submit-progress` foi republicada em 30/10 para o teto de andar (documento de perdão). Confira `supabase functions list` contra o último commit que tocou `_shared` ([[A função publicada não é a função do repositório]]).
- **Perdoar as contas marcadas pelo teto de andar** (`docs/PERDOAR_FALSOS_POSITIVOS_2026-10-30.md`): passo 1 só leitura, passo 2 `progress_clear_flags`. **Não encontrei registro de que isto foi feito.**
- Segredos do Discord e `SOL_USD_PRICE_URL`.

**Produção e dinheiro**
- Produção ainda não existe: plano Pro do Supabase, carteira Solana real, domínio.
- Textos legais: termos, regulamento da Liga com critério de desempate.
- Preço do Passe da Temporada 2 ("não interessa agora", 28/10).

**Equilíbrio e produto**
- **`FLOOR_PACE` medido com números velhos** (honesto chega ao andar 50 no dia 6, tabela diz 8; marca 1 dono do Passe em 12, não rejeita ninguém). Afrouxar enfraquece a defesa contra trapaça ([[Tabela medida uma vez envelhece quando o jogo muda]]).
- **Habilidades vêm só da arma e do peitoral**; ele pediu a leitura larga duas vezes ([[Decisões do dono]]).
- **A decisão grande:** refazer o combate com o catálogo novo (seis slots por build, maestria por família, ~90 habilidades) ou terminar o que existe. Nada foi começado.
- **"Couro (5) + cajado" e "peito de couro + placa"**, os melhores builds da medição de 29/10 de manhã (`docs/AUDITORIA_CLASSES_2026-10-29.md` seção 7). Opções do documento: o transbordo e a Arrancada deixarem de escalar com a velocidade; habilidades da arma só com o peitoral do mesmo peso; ou trocar a meta "classe pura +15%" por "nenhum build acima de +X% em mais de um eixo". **Depois dessa medição as armas foram reequilibradas e não achei nova medição das misturas.**
- **O mago e o tier 3:** continua no dia 25 a 28. O gargalo não é fibra (nem o nível da Horta); é a ordem de compra do mago simulado e a corrente de armas (`e63c6e9`, `d78d109`). Qual alavanca puxar é dele.
- **A corrente de Mineração e Lenhador**: hoje são imposto pequeno e igual para as três classes. Mover o grosso da placa de material de Caça para barras seria "equilíbrio e conteúdo" (`docs/CORRENTE_DO_JOGO_2026-10-29.md`, lacuna 2).
- **A Masmorra não alimenta a Forja** (lacuna 3 do mesmo documento). Um "artefato" que só a masmorra solta é a ideia que o documento cita do Albion.
- O Anel de Vitalidade quase não rende e o cetro gasta o retorno em regeneração que o tecido já dá (`90e022d`).
- **O aviso de reset pré-temporada** não está no modal de boas-vindas vivo (`WelcomeBackModal`); só estava no `WelcomeModal`, que ninguém renderizava (`2ec318c`). Pertence ao modal vivo?
- Tutorial: o passo que mandava gastar pontos em "Guerreiro, Guardião ou Caçador" foi corrigido pelos novos nomes das árvores, mas o documento da primeira hora também mostra que o tutorial inteiro não diz uma palavra sobre classe, peso de armadura ou arma (`docs/PRIMEIRA_HORA_2026-10-29.md` seção 5). O que foi feito depois foi a nota da primeira Forja e a faixa nos cartões de item, **não** um passo de tutorial.
- Dicas de primeira vez: **paradas desde 22/09** (achado do diretor, no mesmo documento); `SaveData.seenTooltips` e a fila em `App.tsx` são "a metade visível de uma funcionalidade que parou de funcionar" (`2ec318c`).

## Trabalho permitido sem perguntar (`CLAUDE.md` seção 4)

- **Corrigir `docs/CLASSES_E_EQUIPAMENTOS.md` seção 5.1.7 e a linha 546.** Descrevem o estado de antes das rodadas das armas ([[Classes e equipamento]]). É o defeito mais comum do repositório.
- **Atualizar os documentos que ainda enganam** (`RESUMO_DO_PROJETO.md` seção 12: `ADMIN`, `AI_OPS`, `MARKET_SOLANA`, `MARKET_FOUNDATION`, `SEASON_RANKING`, `WEB_LAUNCH`, `EVENT_CALENDAR`, `INVENTORY`, `ECONOMIC_REFERENCE`, `UI_REVIEW`, `backend-phase1`).
- **Apagar a pilha de Stripe/BSC em `_shared`** e o teste que a protege, e corrigir `providers/README.md` (promete Pix). Antes, conferir que nenhuma função a importa por outro motivo (`docs/REVISAO_2026-10-29.md`).
- **Os outros achados da revisão de 29/10 que não vi fechados:** um ciclo de importação de 32 módulos em `src/game/`, TypeScript sem `strict`, um único arquivo JS de 1,33 MB (só o mercado carrega sob demanda), três `useEffect` de `App.tsx` com dependência faltando, e `App.tsx` com quase 3.000 linhas. Nenhum dos commits de 29–30/10 que li os fecha.
- **Os tetos do antifraude saíram de um simulador que só jogava o guerreiro** (`4718b2d`, [[2026-10-29 — O simulador só jogava o guerreiro]]). `scripts/sim/classAntifraud.sim.ts` mede as três classes contra os limites do servidor; não sei se foi rodada depois de `2b61cf6`, que consertou o simulador.
- **Os outros três biomas da masmorra ainda têm um monstro só** (`e22ca35`: a três gerações por criatura, cabe no orçamento). Falta o procedimento: **o código que construiu os quadros do lobo não foi commitado** ([[Arte por IA a cada quadro custa dezenas de gerações]]).
- **Testes que acendem o alarme em cima de ruído:** o teste de concorrência que pisca ([[Um teste de concorrência que pisca]]). Se piscar de novo, anotar a data; a terceira vez vira tarefa.

## Perguntas que esta lista deixa sem resposta

- O `progress_clear_flags` já rodou? Quantas contas o passo 1 listou?
- As funções de materiais e de progresso estão com `updated_at` posterior ao último commit de `_shared`?
- A mistura "couro + cajado" ainda é o melhor build depois das rodadas de armas?
