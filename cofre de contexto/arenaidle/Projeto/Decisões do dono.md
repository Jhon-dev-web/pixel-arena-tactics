# Decisões do dono

Voltar: [[Comece aqui]] · Ligações: [[O que está em aberto]] · [[Classes e equipamento]] · [[Antifraude e temporada]] · [[Economia e materiais]]

O que o dono decidiu, quando, e **por quê**. Nenhuma delas se muda sem perguntar a ele de novo, por mais que pareça melhoria.

O motivo de existir esta lista: várias dessas decisões parecem erradas para quem só olha o código, e já foram quase "consertadas" por engano.

---

## Produto e lançamento

**Não existe data de lançamento** (28/10/2026). A data de 31/10 era teste de site: *"esquece 31/10 eu tava testando site"*. **Consequência que se esquece:** o congelamento de conteúdo de 22/10 existia só por causa dela, então ele caiu junto — conteúdo novo é permitido.

**NFT quer dizer mercado e pagamento em cripto, nada mais** (28/10/2026). *"nft é que vou apenas ter mercado e poder usar cripto mesmo"*. Nada é cunhado em blockchain. Quem cria conta com e-mail joga normalmente; a carteira só é necessária para **negociar**.

**Só web.** Sem Steam e sem versão para computador. O portão `check:desktop` continua garantindo que código de mercado não entra naquele pacote (a Valve proíbe negociação de cripto), embora ninguém publique isso.

**Carteira: só Solana** (Phantom), que é o que o jogo todo já usa. Ele mencionou MetaMask, que é Ethereum; a resposta dele sobre NFT tornou o caminho atual suficiente, a recomendação de Solana-só foi registrada e ele não objetou. MetaMask, se vier, é um segundo caminho de pagamento e um projeto próprio (`docs/CLASSES_E_EQUIPAMENTOS.md` seção 6).

**Stripe e Pix foram removidos** (28/10/2026). O histórico está em `docs/PAGAMENTOS_DESCARTADOS.md`. Pagamento é por carteira. Não reintroduza nenhum dos dois achando que é lacuna. Ainda existe código de Stripe dormente em `supabase/functions/_shared/` ([[O que está em aberto]]).

**Prêmio do playtest: os 25 heróis de maior nível, por mérito, nunca sorteio** (no Brasil, sorteio promocional exige autorização) — `RESUMO_DO_PROJETO.md` seção 7.

---

## Campeonato da temporada

**O desempate continua sendo a profundidade na masmorra** (29/10/2026), mesmo sabendo que isso favorece uma classe.

A conta é `computeScore = levelTotal × 1.000.000 + (andar + profundidade)` (`supabase/functions/_shared/progress/metrics.ts`). No topo da tabela, onde todos estarão no nível máximo, **quem decide o prêmio é a masmorra** — que é o eixo do guerreiro.

Foi levado a ele porque há dinheiro real envolvido (prêmio mínimo de US$ 1.000). A resposta: *"ninguém sabe, é testando e vendo onde cada um se sai melhor então pode deixar assim mesmo"*.

A saída natural existe e é parte do desenho: classe é só equipamento, então quem quiser competir pode vestir placa para a corrida da masmorra.

**Ritmo de andar e primeira descida** (30/10/2026): o dono entregou o equilíbrio à direção ("quero você no comando"). `FLOOR_PACE` e a primeira descida (`DEPTH_PACE`) foram remedidos em 30/10/2026 com 186 corridas (144 honestas e 42 de compradores), depois de corrigir o comprador simulado, que vestia peça acima do nível. Andar: 6,6 / 8,4 / 9,2 / 9,3 dias para 50 / 75 / 90 / 100. Primeira descida: marca acima de 94, rejeita acima de 149, só quando a profundidade anterior é 0. O diretor decidiu pelo mandato do dono. O que o trapaceiro ganha está em `bounds.ts`; a função só vale depois de republicar `submit-progress`. Ver [[2026-10-30 — Antifraude rejeitava jogador honesto no dia 2]].

---

## Classes e equipamento

**Três classes, nascidas do que se veste** (28/10/2026): guerreiro, arqueiro e mago. Ele descartou o assassino explicitamente. Modelo: a mecânica de equipamentos do Albion, nada além dela.

**Misturar peças tem de continuar valendo a pena.** *"bota de couro que deixa mais rápido, capacete de ferro, machado"*. É por isso que a afinidade é pequena de propósito e não deve subir.

**A arte do herói não muda com o equipamento.** *"nem precisa aparecer, só a carinha dele"*.

**A tela de Táticas mostra só as imagens** das habilidades concedidas, e as informações aparecem ao tocar. Pedido textual dele. O nome ao lado vale para a **rotação** (quatro itens), não para a grade.

**Habilidades vêm de todo o equipamento vestido**, não só das armas — ele corrigiu isso explicitamente depois de uma leitura errada: *"não só da arma. E sim dos equipamentos em geral, o que tiver equipado"*.

> **O código ainda não cumpre isto por inteiro** (achado em 29/10 por uma auditoria): `equippedAbilities` (`engine.ts`) lê **só a arma e o peitoral**. Elmo, luvas, botas, mão secundária e anel não concedem nada. Entregou-se a leitura estreita ("não só da arma") e não a larga ("o que tiver equipado"). A proposta de redesenho que ele mandou em 29/10 pede exatamente a larga (elmo, peitoral e botas com habilidade própria), o que sugere que é isso que ele sempre quis. **Não trate como pendência fechada nem como decisão cumprida: está em aberto com ele.** A faixa do cartão de item (`e7e577d`) anuncia exatamente o que o motor concede hoje, e o teste que a protege acende no dia em que outro slot passar a conceder.

**O eixo de cada classe** (a tabela de alvos está em `docs/CLASSES_E_EQUIPAMENTOS.md`): mago lidera a Caça, arqueiro lidera os chefes, guerreiro lidera a masmorra. **O tier 3 está fora dos alvos por decisão.**

**Seis mudanças de equilíbrio aprovadas por ele em 29/10/2026.** Duas das seis estão em [[2026-10-29 — O Adubo não pagava nada a quem volta tarde]] (o Adubo e o nome da Arrancada) e uma em `d4aea06` (a besta perde crítico de 1 para 0,5, "o que o dono aprovou"). O resto da lista das seis não está escrito nos commits que li.

**Cetro e machado vencem pela habilidade, nunca pelo equipamento** — consequência do duelo preso a 5% por `contentPack2.test.ts`, não decisão dele ([[2026-10-29 — A besta liderava a Caça e o machado e o cetro eram opções mortas]]).

---

## Eventos

**O acúmulo do bônus do Alvo fica** (29/10/2026), e o texto é que foi corrigido para dizer a verdade (+8% por 1h30, acumulando até +15%). Escolhido por não tirar nada de quem já tem. Ver [[2026-10-29 — O cartão do evento prometia +8% e o jogo pagava até +15%]].

---

## Economia e profissões

**Mineração e Lenhador não dão XP de herói** (28/10/2026).

**A quinta zona de caça foi aprovada** para ser construída (28/10/2026).

**O preço do Passe da temporada 2 não interessa agora** (28/10/2026).

**Ele quer "tudo interligado, uma coisa completa a outra"** (29/10/2026, `docs/CORRENTE_DO_JOGO_2026-10-29.md`). Resultou no mapa da corrente e em três mudanças de drops ([[2026-10-29 — Materiais de classe não caíam onde a classe joga]]). Duas lacunas da corrente (Mineração e Lenhador não são a corrente de ninguém; a Masmorra não alimenta a Forja) pedem mudança de conteúdo e são dele ([[O que está em aberto]]).

**O fio de linho e algodão na Clareira foi escolha dele, olhando o Raven Idle**, onde uma receita come criatura e terra e as atividades se seguram (`e63c6e9`).

**O dono joga duas vezes por dia.** É o padrão de visita que o Adubo precisava atender (`3ac1563`).

**Monstros: ele viu o Raven Idle e disse que lá quase não se mexem**: um idle pequeno e nenhum passeio. Pediu simples; "invisível" não é o que foi pedido (`e22ca35`).

---

## Como ele quer trabalhar

**Opus como diretor, Sonnet como executor** (28/10/2026), escrito por pedido dele em `CLAUDE.md`. Ele pediu a regra de não parar enquanto houver tarefa, e de procurar melhoria quando a lista acabar.

**Ele lê no celular**, em geral longe do computador. Resposta curta, resultado primeiro, português simples.

**Ele manda documentos de outras IAs para ajudar.** Já renderam: a ideia de usar um número **declarado** no portão, em vez do CP calculado, veio de um desses. Vale ler, aproveitar o que serve e **dizer o que não serve** — os documentos costumam trazer mecânicas que este jogo não tem, e ele os repassa adiante.

**Ele não deve ser deixado com a chave na mão sem necessidade.** Quando uma ação precisa de permissão que o Claude não tem, o certo é explicar e dar o comando pronto — e no formato do terminal dele, que é **PowerShell**, não bash.

**Os documentos dele não se reescrevem.** `melhorias.md`, a revisão de interface, os mockups e o material do Discord foram commitados exatamente como estavam (`97cd5b6`), para que um modelo possa ler o projeto inteiro. Estar no repositório não é convite para editar.

**Ele entregou o projeto para outro modelo ler inteiro** (29/10/2026). Daí a reescrita do resumo, a deleção dos documentos que descreviam um jogo que não existe, e a seção de documentos que ainda enganam (`RESUMO_DO_PROJETO.md` seção 12).

---

## O que continua sendo dele, e não do Claude

- qualquer número de equilíbrio ou de economia fora de uma tarefa que ele pediu;
- texto que promete algo ao jogador;
- ritmo de progressão (o portão de sub-nível é ritmo, não capacidade);
- qualquer coisa em produção, no banco de produção, dinheiro real ou mensagem para fora;
- `admin/`, que é de outra frente.

## Decisão grande em aberto

Em 29/10 ele disse que está "quase refazendo este jogo" e enviou uma proposta de catálogo novo de habilidades (seis slots por build, maestria por família, ~90 habilidades). **Nada disso foi começado**, porque refazer o combate e terminar o que existe são trabalhos diferentes e ele ainda não escolheu (`RESUMO_DO_PROJETO.md` seção 7). Ver [[O que está em aberto]].

**Bem-vindo de volta e troca de atividade** (31/10/2026): o Bem-vindo só aparece depois de 30 minutos fora. Toda troca de atividade pergunta com a mesma tela, de qualquer lugar, e um toque para a antiga e começa a nova. A regra de uma tarefa por vez não mudou. Guarda: `taskSwitch.test.ts`.

**Táticas sem escolha** (31/10/2026): o dono prefere todas as habilidades, sem vagas para escolher. Ativas saem sozinhas, cada uma com sua recarga; passivas ficam à parte, com a condição. O save perde `rotation` ao carregar; o motor ainda lê o campo só para as ferramentas de medição. Passivas sem recarga nova: o dono pediu recarga, a direção recomendou não colocar porque enfraqueceria o herói e pediria reequilíbrio, e ele autorizou seguir a recomendação. Medição em [[O que faz diferença na Caça]].
