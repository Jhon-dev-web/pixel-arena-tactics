# Decisões do dono

O que o dono decidiu, quando, e **por quê**. Nenhuma delas se muda sem perguntar a ele de novo, por mais que pareça melhoria.

O motivo de existir esta lista: várias dessas decisões parecem erradas para quem só olha o código, e já foram quase "consertadas" por engano.

---

## Produto e lançamento

**Não existe data de lançamento** (28/10/2026). A data de 31/10 era teste de site: *"esquece 31/10 eu tava testando site"*. **Consequência que se esquece:** o congelamento de conteúdo de 22/10 existia só por causa dela, então ele caiu junto — conteúdo novo é permitido.

**NFT quer dizer mercado e pagamento em cripto, nada mais** (28/10/2026). *"nft é que vou apenas ter mercado e poder usar cripto mesmo"*. Nada é cunhado em blockchain. Quem cria conta com e-mail joga normalmente; a carteira só é necessária para **negociar**.

**Só web.** Sem Steam e sem versão para computador.

**Stripe e Pix foram removidos** (28/10/2026). O histórico está em [`PAGAMENTOS_DESCARTADOS.md`](../PAGAMENTOS_DESCARTADOS.md). Pagamento é por carteira. Não reintroduza nenhum dos dois achando que é lacuna.

---

## Campeonato da temporada

**O desempate continua sendo a profundidade na masmorra** (29/10/2026), mesmo sabendo que isso favorece uma classe.

A conta é `computeScore = levelTotal × 1.000.000 + (andar + profundidade)` (`supabase/functions/_shared/progress/metrics.ts`). No topo da tabela, onde todos estarão no nível máximo, **quem decide o prêmio é a masmorra** — que é o eixo do guerreiro.

Levei isso a ele porque há dinheiro real envolvido (prêmio mínimo de US$ 1.000). A resposta: *"ninguém sabe, é testando e vendo onde cada um se sai melhor então pode deixar assim mesmo"*.

A saída natural existe e é parte do desenho: classe é só equipamento, então quem quiser competir pode vestir placa para a corrida da masmorra.

---

## Classes e equipamento

**Três classes, nascidas do que se veste** (28/10/2026): guerreiro, arqueiro e mago. Ele descartou o assassino explicitamente. Modelo: a mecânica de equipamentos do Albion, nada além dela.

**Misturar peças tem de continuar valendo a pena.** *"bota de couro que deixa mais rápido, capacete de ferro, machado"*.

**A arte do herói não muda com o equipamento.** *"nem precisa aparecer, só a carinha dele"*.

**A tela de Táticas mostra só as imagens** das habilidades concedidas, e as informações aparecem ao tocar. Pedido textual dele. O nome ao lado vale para a **rotação** (quatro itens), não para a grade.

**Habilidades vêm de todo o equipamento vestido**, não só das armas — ele corrigiu isso explicitamente depois de eu ter entendido errado.

**O eixo de cada classe** (a tabela de alvos está em [`CLASSES_E_EQUIPAMENTOS.md`](../CLASSES_E_EQUIPAMENTOS.md)): mago lidera a Caça, arqueiro lidera os chefes, guerreiro lidera a masmorra.

---

## Eventos

**O acúmulo do bônus do Alvo fica** (29/10/2026), e o texto é que foi corrigido para dizer a verdade (+8% por 1h30, acumulando até +15%). Escolhido por não tirar nada de quem já tem. Ver [`BUGS.md`](BUGS.md).

---

## Economia e profissões

**Mineração e Lenhador não dão XP de herói** (28/10/2026).

**A quinta zona de caça foi aprovada** para eu construir (28/10/2026).

**O preço do Passe da temporada 2 não interessa agora** (28/10/2026).

---

## Como ele quer trabalhar

**Opus como diretor, Sonnet como executor** (28/10/2026), escrito por pedido dele em [`CLAUDE.md`](../../CLAUDE.md). Ele pediu a regra de não parar enquanto houver tarefa, e de procurar melhoria quando a lista acabar.

**Ele lê no celular**, em geral longe do computador. Resposta curta, resultado primeiro, português simples.

**Ele manda documentos de outras IAs para ajudar.** Já renderam: a ideia de usar um número **declarado** no portão, em vez do CP calculado, veio de um desses. Vale ler, aproveitar o que serve e **dizer o que não serve** — os documentos costumam trazer mecânicas que este jogo não tem, e ele os repassa adiante.

**Ele não deve ser deixado com a chave na mão sem necessidade.** Quando uma ação precisa de permissão que eu não tenho, o certo é explicar e dar o comando pronto — e no formato do terminal dele, que é **PowerShell**, não bash.

---

## O que continua sendo dele, e não meu

- qualquer número de equilíbrio ou de economia fora de uma tarefa que ele pediu;
- texto que promete algo ao jogador;
- ritmo de progressão (o portão de sub-nível é ritmo, não capacidade);
- qualquer coisa em produção, no banco de produção, dinheiro real ou mensagem para fora;
- `admin/`, que é de outra frente.
