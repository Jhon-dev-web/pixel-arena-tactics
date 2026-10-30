# Guardas que existem

Voltar: [[Comece aqui]] · Ligações: [[Os seis portões]] · [[Ferramentas de medição]] · [[Classes e equipamento]] · [[Antifraude e temporada]] · [[Economia e materiais]] · [[Caça e masmorra]]

Este é o **teste de regressão em prosa**: para cada guarda, **o que ele protege** e **o que fazer se ele acender**, para ninguém afrouxar teste por engano. Quando o texto diz "o número está errado", é a regra do `CLAUDE.md` seção 3: **o número é que está errado, não o teste**. Afrouxar o guarda é o jeito mais rápido de perder a rede inteira.

Tudo aqui foi lido nos arquivos de `src/game/__tests__/` e nos commits de 29–30/10/2026. A lista **não é exaustiva** (`src/game/__tests__/` tem cerca de 144 arquivos, contando auxiliares e vários em `supabase/functions/_shared/__tests__/`); ela cobre o que **não dá sinal na tela** quando quebra. Cada guarda lista a nota do defeito que o criou, quando houve.

Três perguntas para qualquer guarda que acenda, nesta ordem:

1. **Mudou o número ou mudou o jogo?** Se o jogo mudou de propósito, o número da tabela/limite precisa de **nova medição**, não de chute.
2. **A regra que ele protege ainda é verdade?** Se não é, é decisão do dono (equilíbrio, economia, texto) — pare e pergunte.
3. **Ele mede o que diz medir?** ([[Um guarda que mede uma amostra pode passar com a regra quebrada fora dela]], [[Guarda derivado não enxerga a sua mudança]].)

---

## Combate, classes e equipamento

### `classAxes.test.ts` — a justiça entre classes
- **Protege:** que mago lidera a Caça, arqueiro o chefe, guerreiro os andares (tiers 4 e 6) e que **nenhuma arma é pior que a gêmea nos três eixos ao mesmo tempo** (tiers 2 a 6, as seis armas). A besta não passa o melhor mago na Caça. Cada faixa carrega o mínimo, o máximo e o desvio medidos.
- **Se acender:** um número de arma, habilidade, crítico ou da régua mudou o equilíbrio. **O número está errado, não o teste.** Rode `classAxesWide` ([[Ferramentas de medição]]) e leia o ruído **antes** de mexer.
- **Não faça:** afrouxar a margem (ela vem de duas vezes o ruído medido), nem trocar a faixa por um intervalo que "passe". Também não encolha o golpe da besta até o chão do tunable ([[Uma busca numérica conserta pelo caminho mais curto]]).
- **Furo conhecido:** não vê o crítico acima de 100%, porque os heróis dele não têm substatuto. Quem vê é `critOverflow.test.ts`. E o tier 3 é `it.todo` por decisão.
- Defeito de origem: [[2026-10-29 — A besta liderava a Caça e o machado e o cetro eram opções mortas]]; método: [[A tabela de eixos julga classes, não armas gêmeas]].

### `gearIndex.test.ts` — o índice que abre os portões da Caça
- **Protege:** slot vazio vale 0 e o divisor é sempre 7 (tirar uma peça **baixa** o índice, senão se tiraria a pior peça para destravar mais); o índice é o **mesmo para as três classes** com o mesmo equipamento; o conjunto que o texto de requisito nomeia ("um conjunto tier N +R") sempre alcança o que pede, em toda zona, profundidade e sub-nível.
- **Se acender:** alguém mexeu na fórmula ou no texto do requisito. O texto promete uma coisa verdadeira? Se a fórmula mudou, o requisito de **toda** zona precisa ser recalculado.
- Ver [[2026-10-28 — O portão de sub-nível dizia proteger e só atrasava]].

### `zoneLevelGates.test.ts` — os portões de zona
- **Protege:** zona 3 pede nível 40 e zona 4 nível 60; o último sub-nível do fundo mais difícil de **toda** zona é alcançável com o melhor equipamento do jogo; toda profundidade pode ser **iniciada** com o melhor equipamento e uma mais funda nunca pede menos; sub-nível paga o XP dele (1 a base, 6 +25%, 10 +45%); uma zona sem o campo paga plano; o único da última zona cai a 0,000008 por rolagem.
- **Se acender por "inalcançável":** a curva da zona nova ficou fora do alcance de qualquer build (foi o defeito da zona 5, que herdou a curva da 4 sobre uma base 2,24× maior). **Conserte a curva**, não o teste.

### `defaultRotation.test.ts` e `rotationRefill.test.ts` — habilidades e rotação
- **Protegem:** peça de **tier 0 não concede habilidade** (o save novo tem rotação vazia, e uma espada tier 1 com o trapo dá só as três da espada); rotação ausente é automática e segue o equipamento na hora (carregar não grava nada); `rotation: []` é "limpa de propósito" e fica vazia; trocar de arma reabastece **nos mesmos lugares** que a troca esvaziou, mantendo a ordem dele e o limite de slots; o que ele escolheu nunca é reescrito no save; as 21 habilidades têm nome e chamada nas duas línguas, ícone existente e um look definido em `App.css`; nenhum texto promete crítico garantido.
- **Se acender:** alguém voltou ao padrão `line ?? 'sword'` para peça nova, ou mudou onde a leitura da rotação mora (`effectiveRotation` é o único ponto por onde passam combate, CP e tela).
- Ver [[2026-10-29 — A clava de madeira dava técnicas de espada]] e [[2026-10-29 — Trocar de arma esvaziava a rotação sem avisar]].

### `abilitiesIdentity.test.ts` + `abilitiesGolden.json` — o motor não mudou sozinho
- **Protege:** um herói com rotação **vazia** luta exatamente como antes do motor de habilidades: toda sessão do golden sai idêntica, e a sessão não ganha campo novo.
- **Se acender:** a aritmética do motor mudou. **Não regrave o golden.** O golden é a única prova de que o motor está parado; regravar é destruí-la. A fixture em volta pode ser fixada no que era (foi o que se fez quando a pena entrou na Clareira); o relógio do teste é preso (`vi.useFakeTimers({ toFake: ['Date'] })`). Ver [[Teste que depende da data de hoje]].

### `critOverflow.test.ts` — o crítico acima de 100%
- **Protege:** um crítico maior num herói já acima do teto ainda aumenta dano e CP; **quem está em exatamente 100% ou abaixo não ganha nada de graça**; a chance nunca passa de 1.
- **Se acender:** voltou o corte antigo (e o arqueiro de tier alto volta a valer o mesmo que um tier 4) ou alguém liberou a chance acima de 1 (o que derrubava `sanitizeHuntSession`). Ver [[2026-10-29 — O crítico acima de 100% era jogado fora]].

### `affinity.test.ts` — a afinidade pequena e inofensiva
- **Protege:** 3 peças de um peso dão o bônus pequeno, 5 dão o cheio, 5 mais a arma dão o degrau de classe; quem não tem 3 peças do mesmo peso fica exatamente igual a ter a chave desligada; iniciais, anéis e relíquia nunca contam; **todo stat do degrau de 3 peças fica abaixo do mesmo stat do primeiro passo de todo conjunto daquele peso**; um campo de peso ausente é placa e uma linha ausente é espada; `normalizeSave` apaga `noAffinity` (nunca persiste); `maxHpPct` está vivo no combate.
- **Se acender por "afinidade maior que conjunto":** alguém subiu a afinidade. **Não suba**: o dono pediu que misturar continuasse valendo ([[Decisões do dono]]).

### `attackClock.test.ts` — o relógio de ataque da masmorra na tela
- **Protege:** o relógio guarda o resto de cada golpe e chega ao mesmo tempo total dos espelhos em 2000 golpes (quatro intervalos); acompanha quadros irregulares (até 80 ms atrasados); uma aba escondida dá **um** golpe ao voltar, nunca uma rajada; duas paradas ou mais realinha para agora.
- **Se acender:** a masmorra assistida voltou a correr mais devagar que todo andar medido. Não "conserte" mudando só o relógio do herói: o do inimigo tem de acompanhar ([[2026-10-29 — A masmorra na tela perdia o tempo que o simulador guardava]]).

### `tacticsRows.test.ts` — a recarga que o herói realmente tem
- **Protege:** cada linha cheia traz nome, fonte, recarga e as setas; a primeira não sobe e a última cheia não desce; **a grade do que o equipamento concede mostra só imagens** (decisão do dono); um herói de nível baixo lê recarga **maior** que o tunable cru e o de nível 100 lê o cru; com o equipamento inicial a tela explica por que está vazia, nas duas línguas.
- **Se acender na recarga:** a tela voltou a imprimir o número cru ([[2026-10-29 — A tela de Táticas mostrava uma recarga que o herói nunca tem]]).

### `itemIdentity.test.ts` e `forgeClassNote.test.ts` — o jogo diz a verdade sobre a classe
- **Protegem:** todo cartão de peça diz peso, estilo e (arma) linha, **lidos pelo mesmo mapa** que o filtro da Forja e `affinity.ts` usam; anel, relíquia e peças do tier 0 não imprimem nada; **a contagem de habilidades anunciada é a que o motor concede, para toda peça vestível**; a nota da primeira Forja pareia cada peso com a sua classe (percorrendo `CLASS_OF_WEIGHT`) e **não promete slot decisor**.
- **Se acender na contagem de habilidades:** outro slot passou a conceder habilidade e o cartão envelheceria em silêncio. Isso é o aviso de que a decisão sobre a leitura larga mudou ([[Decisões do dono]]).
- Ver [[2026-10-29 — Nomes que contradiziam o que a coisa é]].

### `itemBalance.test.ts` — o equilíbrio das peças
- **Protege** (blocos R1, R2, R4, R5, R7): a tabela de raridade da forja é 61 / 25 / 10 / 4 e 120 mil sorteios com semente caem a 0,5 ponto dela; a raridade vale o que deve para um conjunto inteiro; os substatos de combate valem mais ou menos o mesmo; `goldBonus` nunca passa de +25%; toda peça forjada é um upgrade real do tier anterior (cada passo soma ao menos 15%, nada fica pior em nenhum stat); nenhuma peça é estritamente pior que outra do mesmo slot que custe o mesmo ou menos; o conjunto de couro tem **custo** dentro de 15% da gêmea de placa a partir do tier 3.
- **Se acender:** alguém mexeu num gerador ou numa peça. Se a peça nova é de uma linha leve, **regere** o bloco com `weightBudget.gen.ts` em vez de escrever à mão ([[Ferramentas de medição]]).

### `forestVariety.test.ts` — arte nunca mexe no jogo
- **Protege:** vida, dano, velocidade, esquiva, cura, ouro, Éter, drops, gemas, únicos e relíquias dos andares 1 a 24 do primeiro bioma ficam nos valores de antes; a arte **alterna** (goblin nos ímpares, lobo nos pares, o Rei Goblin no 25).
- **Se acender:** a mudança de arte tocou o jogo. **Conserte o que tocou, nunca a tabela.** Provado vermelho dos dois lados ([[Arte por IA a cada quadro custa dezenas de gerações]]).

### `classBalanceTools.test.ts` — as ferramentas medem o que dizem
- **Protege:** o herói que a régua monta tem sete peças do tier, a arma da família, a classe ativa e a rotação cheia; os modos `gear`, `rotation` e `real` ligam exatamente o que dizem; `buildHero` continua só-equipamento por padrão (as auditorias de equipamento dependem disso).
- **Se acender:** a régua mudou, e **todas** as medições de equilíbrio mudam com ela ([[2026-10-29 — O simulador só jogava o guerreiro]]).

---

## Economia, materiais e servidor de itens

### `materialFlow.test.ts`
- **Protege:** toda receita, melhoria de baú e refino aponta para material que existe; o refino +4 em diante pede material de Caça do tier da peça e nada abaixo disso; um conjunto do mesmo tier leva as horas de Caça pretendidas e os tiers continuam crescendo; **a Caça nunca é o jogo inteiro nem é desprezível** ao lado de Mineração e Lenhador; o conjunto pede todo material de Caça que as zonas largam, no tier a que pertence; **a primeira caça de 4 h de um herói novo paga as primeiras peças e enche no máximo 8 dos 26 slots** (um terço, no máximo: a mochila de um herói novo não pode entupir).
- **Se acender no B3:** conteúdo novo na Caça entupiu a primeira sessão. É mudança de produto, não número entortado: subir o limite de slots precisa de motivo escrito, como em `e63c6e9`.

### `mageFiber.test.ts` — o fio de fibra
- **Protege:** toda fibra dos dois primeiros tiers de tecido cai numa zona que abre **antes** do pântano, no fluxo de classe; a fibra dos tiers seguintes (seda, `moonweave`, `voidsilk`) **nunca** cai (um drop de `wild_silk` supriu 100% da seda do mago e a Horta deixou de ser plantada); é um fio, não uma segunda Horta (o máximo por hora que a Caça paga de uma fibra fica abaixo da metade do que os seis canteiros pagam, e a cópia do servidor tem isso).
- **Se acender:** alguém subiu a chance ou pôs a seda. A Horta passaria a ser opcional para quem paga — a única coisa que isso não podia fazer ([[2026-10-29 — Materiais de classe não caíam onde a classe joga]]).

### `gardenFertilizerIdle.test.ts` — o Adubo e quem volta tarde
- **Protege:** quem visita a cada 12 ou 24 h tira **mais** XP de Jardinagem de uma plantação adubada que de uma comum, e por menos que o +40% do guarda antigo; o extra é pago **na colheita** e só em canteiro adubado; quem o Adubo realmente ajudou (visita a cada 4, 6 ou 8 h) recebe **exatamente** o que sempre recebeu.
- **Se acender:** o Adubo voltou a não pagar nada para o dono, que joga duas vezes por dia. **Mexeu aqui? Verifique também o limite do servidor** ([[Guarda derivado não enxerga a sua mudança]]).

### `balance.test.ts`
- **Protege:** a Masmorra dá 10 entradas grátis por dia e uma derrota guarda 75% do ouro; a primeira caça de 4 h num saco vazio não perde nada para 12 horários de início diferentes e cabe em poucos slots; o Passe soma slots para sempre (nunca expira); o andar logo depois de um chefe nunca é mais mole que o anterior; todo chefe de bioma é pelo menos 1,5× em vida × dano o andar anterior; a curva da masmorra não decresce; as duas primeiras zonas largam três tipos de material e as duas tardias cinco, mais os materiais de classe.
- **Se acender:** foi mudança de conteúdo ou de curva. Ler o nome do `it` que falhou diz qual regra: é a regra, não o número, que o dono protege.

### `tradeableActions.test.ts` e `tradeableMaterials.test.ts` — material negociável
- **Protegem:** o que entra na mochila numa coleta é **reportado**, e a coleta paga exatamente como antes; **o servidor sorteia, o jogo marca**; a pilha negociável nunca passa do que o servidor deu nem do que a mochila segura; servidor fora do ar deixa o relatório na fila, não marca nada e o jogo **recusa gastar** unidade negociável; recusa é final (as unidades viram normais e o relatório sai); relatório sobrevive a recarregar e um relatório danificado é descartado; gastar enfileira uma queima e o pedido repetido leva o **mesmo id** (o servidor queima uma vez); a pilha nunca passa do saldo (o excesso vira unidade normal, o total não muda); um save editado com unidades que o servidor nunca emitiu é zerado; entrega só é confirmada quando o servidor guarda um save com as unidades; **a bandeira "inalcançável" expira em 30 s** (bloqueia aos 29,999, libera aos 30, a tentativa seguinte **chama** o servidor, offline bloqueia na hora); só o que uma coleta produz é negociável, e barras, cabos, pó e material de loja nunca.
- **Se acender:** economia de mercado em risco: duplicação ou perda de unidade. Não relaxe ([[Economia e materiais]], [[2026-10-29 — A bandeira de sem conexão nunca voltava atrás]]).

### `itemTables.test.ts`, `materialServer.test.ts`, `seasonProgress.test.ts` — o servidor tem cópias do jogo
- **Protegem:** os arquivos `supabase/functions/_shared/items/tables.ts`, `.../materials/tables.ts` e `.../progress/tables.ts` são **exatamente** o que o gerador escreveria agora. `itemTables`: raridades, substatos, receitas, zonas, chefes, sorte, bolsas, selos; todo item forjável e todo único na tabela certa e **nada além**; todo único cai de exatamente um lugar que o servidor conhece; `rollRarity`, `rollSubstats` e `rollUnique` do servidor iguais aos do jogo. `materialServer`: ids, classes, tetos, tiers, plantas e canteiros; **o conjunto de materiais negociáveis é exatamente o que o jogo lista e todos têm um pico diário**; o melhor build de Mineração e Lenhador (cap de profissão, Passe, todo bônus) fica **abaixo** do que o servidor aceita por hora; um canteiro de uma planta nunca rende mais por hora do que a tabela diz; um dia de jogador honesto rápido cabe nos tetos de 24 h. `seasonProgress`: as constantes teóricas e de XP de profissão são **pelo menos** o que os tunables permitem; um herói novo enviado do jeito que o jogo envia lê como nível 1; os campos que as métricas leem existem com os mesmos nomes no save real.
- **Se acender por "tabela velha":** rode o gerador (`npm run season:tables`, `item:tables`, `material:tables`) **e republique a função** ([[A função publicada não é a função do repositório]]). **Nunca edite a tabela gerada à mão.**
- **Se acender por "teto abaixo do que o jogo produz":** o conteúdo novo paga mais do que o servidor aceita. Isso **barraria jogador honesto**. Alargue o limite por medição e confirme que o guarda vê a mudança ([[Guarda derivado não enxerga a sua mudança]]). Foi o caso do Adubo (80 para 100).

---

## Antifraude

### `honestPlayerAntifraud.test.ts` — o jogador honesto nunca é rejeitado nem marcado
- **Protege:** joga os dez primeiros dias (por padrão) do jogador comum (A) e do dono do Passe (P), com duas sementes e um snapshot depois de cada visita, mostrando cada um ao `evaluateSnapshot` **real**, com o histórico guardado como o servidor guarda (só `ok` vira base); **falha** se qualquer snapshot honesto for rejeitado (progresso perdido) **ou** marcado (fica fora do ranking que conta).
- **Não cobre:** a corrida longa (dias além de ~15; para isso, `sim:long` e `classAntifraud`), nem jogador mais rápido que o bot simulado.
- **Se acender:** o limite está errado **para o jogo**, não o teste. Alargue em `bounds.ts` por medição (`HONEST_SEEDS` e `HONEST_DAYS` alargam o teste à mão para re-medir). Depois: republicar `submit-progress` e **perdoar quem foi marcado** (`docs/PERDOAR_FALSOS_POSITIVOS_2026-10-30.md`). Mensagem típica: "A1 day 2 second visit (level 13, floor 25): FLOOR_ABOVE_LEVEL_CAP".
- Ver [[2026-10-30 — Antifraude rejeitava jogador honesto no dia 2]] e [[Tabela medida uma vez envelhece quando o jogo muda]].

### `progress.test.ts` (servidor), caso das duas chamadas paralelas
- **Protege:** de duas chamadas paralelas exatamente **uma** grava um snapshot (o resto recebe o último veredito ou "ocupado").
- **Se acender:** pode ser o teste que pisca ([[Um teste de concorrência que pisca]]). Anote a data; a terceira ocorrência vira tarefa.

### Testes de migração (`migration00NN.test.ts`, em `supabase/functions/_shared/__tests__/`)
- **Protegem:** as garantias de SQL contra o próprio arquivo da migração. Exemplo: `migration0009` é SQL que nunca foi rodado a partir deste repositório, e o teste pina "a primeira Liga paga reseta todo herói online, uma vez". Eles **leem o arquivo**: por isso precisam normalizar fim de linha ([[Testes que passam só na sua máquina (fim de linha)]]). O plano de testes SQL no fim de cada migração é a prova contra um banco de verdade.
- **Se acender:** alguém mexeu na migração. Migração que lê `reset_at` precisa entrar na lista de `migration0009.test.ts` ([[Armadilhas herdadas de direções anteriores]]).

---

## Texto, tela e o que se promete ao jogador

### `eventCards.test.ts` — o cartão diz o que a regra paga
- **Protege:** os números da configuração (`HUNT_EVENT_RULES`, `EVENT_BUFF_RULES`, `EVENT_XP_CAP`) **aparecem** no texto do cartão de cada evento, em `pt` e `en`.
- **Se acender:** o número do jogo mudou e o texto não, ou o contrário. Mudar `targetBuffPct` de 0,08 para 0,085 faz dois testes falharem, um por idioma. O texto que promete algo ao jogador é do dono ([[2026-10-29 — O cartão do evento prometia +8% e o jogo pagava até +15%]]).

### `locales.test.ts` e `noEmoji.test.ts`
- **Protegem:** `pt.json` e `en.json` têm as **mesmas chaves**, nenhuma string vazia, os mesmos `{placeholders}` por chave; **nenhuma descrição de peça tem um dígito** (o número vem dos dados e um número digitado envelhece); nenhuma string visível usa os nomes antigos da moeda rara (é Éter / Aether); cada idioma é chamado no próprio idioma; nenhum emoji na tela nem nos locales (regra do dono: só ícone de pixel ou texto).
- **Se acender:** alguém acrescentou texto em uma língua só, ou digitou número numa descrição. Conserte o texto.

### `leagueReset.test.ts` — o aviso de reset
- **Protege:** só um herói de antes do reset é trocado, e só quando o servidor deu um momento; apaga o herói e mantém nome e Passe; recarregar não reseta de novo; duas abas não resetam duas vezes; falha de upload mantém o herói novo na revisão antiga; o Passe que o servidor respondeu vale para o herói novo; e o aviso aparece nas **duas telas que o jogador vê** (a aba de temporada e o portão de entrada).
- **Se acender no aviso:** antes ele guardava uma tela morta (`WelcomeModal`, que ninguém renderizava). Se o aviso mudar de lugar, o teste muda com ele ([[2026-10-29 — Componentes que ninguém renderizava e um teste guardando um deles]]).

---

## Segurança do pacote e do mercado

### `marketWiring.test.ts` e `bundleDevCode.test.ts`
- **Protegem:** o mercado só liga com `VITE_MARKET_ENABLED=true` **e** um backend; nada no bundle principal importa o mercado estaticamente (só imports lazy atrás da constante de build); **nenhuma tela, identificador ou requisição nomeia chave privada, semente ou mnemônico**; não existe campo de senha ou segredo nas telas do mercado; o único campo de texto longo é a assinatura da transação (limitado a 100 caracteres); o aviso "o jogo nunca pede a chave" está nas telas de carteira, compra e Passe; o build de produção não carrega ferramenta de desenvolvedor (e o controle prova que os marcadores continuam existindo).
- **Se acender:** código de mercado vazou para o pacote desktop (a Valve proíbe negociação de cripto) ou ferramenta de DEV foi para produção. **Nunca relaxar** ([[Os seis portões]]).
- Atalho: `SKIP_BUNDLE_CHECK=1` pula as construções ao iterar; não vale como prova.

---

## O que **não** tem guarda (e o que ocupa o lugar)

| O que | Por que não tem | O que ocupa o lugar |
|---|---|---|
| Que `HEAD` compila e passa sem os arquivos da árvore de trabalho | é hábito, não teste | rodar os portões num `git worktree` limpo ([[Os portões verdes podem estar mentindo]]) |
| Que o **verbo** de um rótulo bate com o que o código faz | nenhum teste lê verbo | abrir o jogo ([[Números e promessas que envelhecem calados]]) |
| Que a função publicada tem o `_shared` de hoje | está no servidor, não no repositório | `supabase functions list` ([[A função publicada não é a função do repositório]]) |
| O **tamanho** da amostra que o próprio guarda mede | só a ferramenta imprime o ruído | `AXES_NOISE=k` ([[Ferramentas de medição]]) |
| Que as misturas e variantes (couro + cajado etc.) não dominam as classes puras | `classAxes` monta as seis armas por tier, não as misturas que a auditoria de 29/10 mediu | nada; ver [[O que está em aberto]] |
| Que `recommendedCp.ts` está em dia com a curva da masmorra | o comentário do gerador cita `recommendedCp.test.ts`, que não existe | rodar `npm run sim:cp` ao mexer na curva |
| Que o antifraude cobre o **ritmo** do jogador honesto de longo prazo (dia 15 em diante) | `honestPlayerAntifraud` cobre os dez primeiros dias | `sim:long` e `classAntifraud` à mão |
