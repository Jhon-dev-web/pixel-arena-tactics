# Arena Idle — Documento de desenho do jogo (GDD)

Estado em 28/10/2026. Escrito para ser lido inteiro por quem nunca viu o projeto, sem precisar abrir o código.

---

## 1. O que é

**Arena Idle é um RPG idle em pixel art que roda só no navegador, no computador ou no celular.** O herói age sozinho enquanto o jogador está fora: caça monstros, minera, corta madeira, cuida da horta, forja equipamento e desce a masmorra. O jogador volta, recolhe o que rendeu, equipa, decide o próximo passo e sai de novo.

Não há versão Steam nem instalável. O código do app desktop continua no repositório, parado.

A regra de desenho que manda em tudo: **não é um jogo para ficar assistindo.** A caça é uma cena pequena no mapa mais o inventário; a arena com combate animado só aparece na Masmorra. O que prende não é a tela, é voltar e encontrar progresso.

Uma segunda regra, menos óbvia e igualmente firme: **o jogo não mostra taxa de drop nem "por hora"**. O jogador sente onde rende mais em vez de ler uma planilha. As chances da forja, do Selo e da garantia são a exceção, porque ali ele está apostando conscientemente.

---

## 2. O laço principal

O jogador escolhe **uma tarefa** e sai. O herói a executa sozinho, acumulando resultado, até o armazém encher.

1. **Escolher** o que o herói faz: caçar, minerar, cortar madeira, descer a masmorra ou produzir na forja.
2. **Sair.** O progresso corre com o jogo fechado.
3. **Voltar e recolher.** O armazém guarda 6 h de caça, ou 10 h com o Passe de Aventureiro.
4. **Gastar o que rendeu**: forjar, melhorar, refinar, distribuir ponto de atributo, trocar de equipamento.
5. **Decidir o próximo passo** e sair de novo.

**Uma tarefa por vez.** Caça, Mineração, Lenhador, Masmorra e a produção na Forja e nos Ofícios ocupam o herói. A **Horta é livre** e corre sempre em paralelo, o que a torna o único ganho que nunca compete com outro.

Essa regra é o coração da decisão do jogo: não existe "fazer tudo". Cada hora investida numa atividade é uma hora não investida nas outras, e é isso que dá peso à escolha.

---

## 3. O herói

Um herói por conta, do nível 1 ao 100. Ele não tem classe: tem atributos, habilidades passivas e o que estiver vestindo.

**Atributos.** Cada nível dá pontos para distribuir entre quatro:

| Atributo | O que faz |
|---|---|
| Força | dano por golpe |
| Vitalidade | vida máxima |
| Agilidade | velocidade de ataque (com retorno decrescente, piso de 400 ms) |
| Resistência | redução de dano (fórmula assintótica, nunca chega a 100%) |

**Habilidades passivas.** Um ponto a cada 5 níveis, em três caminhos de 7 habilidades: **Brutalidade** (dano, crítico, sangramento), **Resiliência** (vida, bloqueio, espinhos) e **Riqueza** (ouro, material, XP, espaço de bolsa). São passivas e automáticas; algumas disparam golpes sozinhas, por contador ou por tempo. Quem tem o Passe tem dois conjuntos de pontos e troca entre eles sem custo.

**De onde vem o XP.** Só da **Caça**, e **por abate**: cada monstro derrubado paga, proporcional ao tamanho dele. Quem mata mais rápido sobe mais rápido, até um teto de ritmo que impede uma build de disparar na frente. Masmorra, Pedidos e poções não dão XP de herói.

---

## 4. Classes sem escolher classe

**O jogador nunca escolhe uma classe. Ele é o que está vestindo.** A referência é o Albion Online, e só a mecânica: equipamento define o papel, cada linha tem a sua cadeia de material.

Três **pesos de armadura**, que valem para armadura, elmo, luvas, botas e mão secundária:

| Peso | Cadeia de material | O que dá | Papel |
|---|---|---|---|
| Placa | minério → barra (Fornalha) | vida e resistência | aguenta, desce fundo na Masmorra |
| Couro | retalho → couro (Curtume) + tendão | velocidade de ataque e crítico | mata rápido, bom em chefe |
| Tecido | fibra → tecido (Tecelagem) | multiplicador de crítico e regeneração | mata muitos, melhor na Caça |

Seis **linhas de arma**, duas por classe: espada e machado (Guerreiro), arco e besta (Arqueiro), cajado e cetro (Mago).

**A afinidade.** Vestindo 3 peças do mesmo peso vem um bônus pequeno; 5 peças, o bônus cheio; 5 peças mais a arma da família, o bônus de classe. A tela de Personagem mostra um selo com a classe atual e o que falta. O jogo **nunca escreve "sua classe é X"**: ele diz "o que você veste combina com o estilo Arqueiro" e fecha com "é o reflexo do que está vestido, troque as peças e ele muda".

**Misturar é legítimo, e isso foi protegido de propósito.** O bônus de afinidade é deliberadamente **menor que o bônus de conjunto**, porque o jogo já premia vestir o mesmo tier e dois prêmios de uniformidade somados empurrariam todo mundo para o conjunto puro. Quem mistura perde o selo mas mantém o stat de cada peça — bota de couro pela velocidade com elmo de ferro pela vida é uma escolha de verdade.

---

## 5. Equipamento

**Oito slots:** arma, armadura, elmo, luvas, botas, anel, mão secundária e relíquia. A mão secundária aceita **escudo** (placa), **aljava** (couro) ou **grimório** (tecido). Sete deles são **instanciados**: cada peça é um objeto próprio, com raridade, substatutos, refino, soquetes e durabilidade. Só a relíquia é empilhável.

**Seis tiers**, com portas de nível: 1, 10, 25, 50, 70 e 90. Cada peça é forjada a partir da do tier anterior do mesmo slot, então toda linha é uma corrente.

**Cinco raridades:** Comum, Incomum, Raro, Épico e Lendário. A forja sorteia; Lendário sai em 4%, com garantia na 41ª forja de tier 4 ou mais.

**Refino** de +0 a +8, e até +12 nos tiers 5 e 6. **Gemas** em soquetes, **substatutos** por raridade, **durabilidade** que cai com o uso e **reforja** de substatuto com custo crescente.

**Únicos:** 14 peças que só caem, nunca são forjadas. Valem 10 a 15% mais que a gêmea forjada e carregam um substatuto extra. São raras de propósito — cerca de uma a cada 20 ou 30 dias de jogo por zona — porque são bem negociáveis.

**O que a reforma de 28/10 acrescentou:** 84 peças novas. Trinta de couro, trinta de tecido e vinte e quatro armas (arco, besta, cajado, cetro). Nenhum número das peças antigas mudou.

Os números das peças novas **não foram escritos à mão**: um gerador resolve, por tier, a conversão que faz o conjunto completo de cada peso valer o mesmo poder de combate que o de placa, dentro de ±5%. Isso foi só o ponto de partida: a fase 8 mostrou que poder de combate não mede justiça, e os retornos das linhas leves ganharam um ajuste (`RETURN_SCALE` em `gear.ts`), de modo que a paridade de poder de combate não vale mais; o juiz é a tabela de eixos. Duas regras duras governam esse gerador: **a peça do tier seguinte nunca pode ser pior** em nenhum stat, e o custo de cada peça fica a 15% do custo da gêmea de placa.

---

## 6. Habilidades e a rotação

**O equipamento concede habilidades, e o jogador monta a ordem em que elas saem.** São 21: três por linha de arma e uma por peso de peitoral.

**Como funciona.** A cada momento em que o herói atacaria, ele percorre a rotação de cima para baixo e **dispara a primeira que estiver fora de recarga**. Se nenhuma estiver pronta, dá o ataque básico. Tudo automático: o que o jogador decide é a rotação, não o botão. É a decisão que cabe num idle — escolhida uma vez, rende por horas.

**A tela Táticas** tem a rotação no alto, em quatro linhas (posição, ícone, nome, de qual peça vem, recarga, e as setas de subir e descer na própria linha), e embaixo o que o equipamento concede, só em imagens, agrupado pela peça ("Arma: Espada", "Peitoral: Placa"). Tocar numa habilidade abre um card com tudo sobre ela (recarga, todos os efeitos, a posição) e os botões de colocar, subir, descer e tirar. Mexer altera só um rascunho; "Aplicar" confirma. **O equipamento inicial (a clava e as roupas esfarrapadas, tier 0) não concede habilidade nenhuma**: com ele a tela explica o motivo e a rotação fica vazia; as técnicas aparecem com a primeira peça de tier 1 em diante.

**O modo automático.** Quem nunca abrir a tela não fica com o equipamento desligado: a rotação é montada a partir do que está vestido, **na hora**. Trocar de espada para arco repõe as habilidades do arco imediatamente, sem recarregar o jogo. Só quando o jogador escolhe à mão a lista passa a ser dele.

**Os oito efeitos** são um conjunto fechado de propósito, porque cada um precisa funcionar nos três lugares onde o combate roda:

| Efeito | O que faz |
|---|---|
| Golpe | um ataque de X% do dano |
| Rajada | N golpes rápidos |
| Contínuo | queimadura ou sangramento |
| Área | parte do golpe vai para o **próximo** inimigo |
| Guarda | reduz o dano recebido por alguns segundos |
| Cura | recupera parte da vida |
| Pressa | velocidade de ataque por alguns segundos |
| Abertura | atrasa o primeiro ataque do inimigo |

**Por que "área" significa o próximo inimigo:** as duas lutas do jogo são um contra um, em sequência. Não existe inimigo simultâneo. Então a área transborda dano para a próxima luta, que começa com o inimigo já machucado — com teto e sem encadear, para um mago forte não varrer a fila inteira.

---

## 7. As atividades

| Atividade | O que dá | Como funciona |
|---|---|---|
| **Caça** | XP do herói (a única fonte) e a maior parte dos materiais | 5 zonas, cada uma com profundidades e sub-níveis que o herói conquista vencendo. Armazena 6 h, ou 10 h com o Passe. |
| **Masmorra** | ouro, gemas, únicos de chefe, relíquias | 100 andares e as Profundezas depois. Chefes a cada 25. É o único lugar com combate animado. 10 entradas grátis por dia. |
| **Mineração** | minério | nível próprio, cinco tiers de minério |
| **Lenhador** | madeira | nível próprio, cinco tiers de madeira |
| **Horta** | ervas, flores e fibras | livre, corre em paralelo com tudo. Canteiros com tempo de colheita. |
| **Forja** | equipamento | forjar, melhorar, reparar, gemas. Filtro por classe. |
| **Ofícios** | material refinado | Fornalha, Curtume, Carpintaria, **Tecelagem**, Pó de Refino e Alquimia |
| **Pedidos** | ouro e recompensa | entregas de material com prazo |
| **Missões e Códice** | recompensa e registro | conquistas e catálogo do que já foi visto |
| **Calendário** | eventos | festival de abertura, evento de herói nos fins de semana, dia de profissão |

**As cinco zonas de caça**, em ordem: Clareira Demoníaca, Pântano de Sangue, Fenda Demoníaca, Abismo de Sangue Ancestral e **Trono do Abismo Eterno**. A quinta foi acrescentada em 28/10 para a segunda metade da temporada — até então o herói ficava parado na quarta do dia 30 ao 60.

**Produção em lote.** Forja e Ofícios aceitam quantidade, levam um segundo por unidade e continuam com o jogo fechado.

---

## 8. Economia

**Três cadeias de material, uma por classe.** Essa simetria apareceu quando a reforma de 28/10 criou a terceira, e ela virou um dos melhores acidentes do desenho: **cada classe nasce numa atividade diferente.**

| Classe | Nasce em | Cadeia |
|---|---|---|
| Guerreiro | Mineração | minério → barra, na Fornalha |
| Arqueiro | Caça | retalho → couro, no Curtume, mais tendão |
| Mago | **Horta** | fibra → tecido, na Tecelagem |

A terceira resolveu um problema antigo: a Horta era a atividade mais fraca do jogo, servindo só para poções. Agora ela é o começo de uma linha inteira de equipamento.

**Moedas.** Ouro para quase tudo. **Éter** (`shards` no código) para as operações raras: reforja, dragon e abissal. **Gemas** para soquetes.

**Sumidouros de ouro:** forjar, melhorar, reparar, refinar, reforjar e lapidar. O orçamento de ouro do jogo gira em torno de 2 a 5 mil por dia, e cada sumidouro é calibrado contra isso.

**O mercador atacadista** compra o excedente barato, porque o armazém enche. Vender para outro jogador tem de continuar claramente mais lucrativo — e a venda é sempre escolha manual, nunca automática.

**Nada de taxa na tela.** O jogo não mostra porcentagem de drop nem rendimento por hora. Essa regra vale inclusive para os textos novos.

---

## 9. Temporada e Passe

**Pré-temporada (agora).** Teste aberto, sem prêmio. Quando a Liga começar, todos os heróis recomeçam do zero uma vez; o Passe e o nome continuam. A Liga abre quando a barra de Passes vendidos enche, e **o número da meta não aparece em lugar nenhum**.

**A Liga da Temporada.** Sessenta dias, ranking por nível do herói e por profissão, **só para quem tem o Passe**. Prêmio em dinheiro, mínimo de mil dólares para os primeiros lugares, podendo crescer conforme mais Passes forem vendidos.

**O Passe de Aventureiro.** Dez dólares, pagos **só em USDC na rede Solana**, uma vez. Vale para a pré-temporada e a Temporada 1; quando a Temporada 2 abrir é preciso comprar o novo, e o que foi ganho na trilha fica.

O que ele dá: armazém de 10 h em vez de 6, +15% de ouro, +10% de materiais, mais espaço de bolsa, um segundo conjunto de pontos de habilidade, trilha de recompensas e a entrada no ranking. **Quem compra sai claramente na frente** — essa é uma decisão explícita do dono, e o equilíbrio nunca deve nivelar comprador e não comprador.

**Convites.** Pelo próprio jogo, por link, sem e-mail. Convite ativo = o amigo chegou ao nível 10. As recompensas vão do título Recrutador (1 convite) até um Passe grátis quando 10 convidados compram o deles.

**Eventos.** Evento de herói toda sexta à noite até domingo, dia de profissão nas quartas, e um Festival de Abertura. As datas ficam no banco, então o dono muda sem publicar o jogo de novo; a migration `0035` ainda semeia o Festival em 31/10 a 02/11, a data do playtest cancelado.

---

## 10. Mercado e monetização

**Duas fontes de receita, e só duas:** o Passe de dez dólares e uma **taxa de 5%** sobre cada venda no mercado entre jogadores.

**O mercado é só na rede Solana.** Itens e Bolsas de Ouro têm preço em SOL; o Passe é pago em USDC. **Sem custódia**: o comprador paga direto para a carteira do vendedor, e a taxa do jogo vai para a carteira do jogo. O servidor confere a transferência na blockchain antes de mover o item.

**Conta por e-mail joga tudo.** A carteira só é necessária para negociar.

**Nada é cunhado na blockchain.** Não há NFT, nem token próprio, nem coleção. "Focado em NFT", nas palavras do dono em 28/10, significa ter mercado e poder usar cripto — que é exatamente o que já existe.

**O que pode ser vendido:**

- Equipamento **Épico, Lendário ou Único**, **nunca equipado** (equipou, prende na conta) e **forjado online**, com certificado do servidor.
- Materiais de coleta, mas só na versão negociável que o servidor sorteia por coleta. O que é refinado ou produzido nunca é negociável.
- Bolsas de Ouro de 2 mil, 5 mil e 20 mil, com piso de 25 centavos de dólar por mil de ouro.

**O que nunca pode:** peça do Selo do Ferreiro, item feito offline, qualquer coisa que já foi equipada.

No pagamento vai um memo que liga a transferência à reserva; pagamento sem correspondência cai numa fila de exceções em vez de se perder. Pagar com a mesma carteira que recebe é recusado.

**Stripe e Pix estão fora**, por decisão de 28/10. O que existia está registrado em `docs/PAGAMENTOS_DESCARTADOS.md`, com o caminho de volta caso um dia sejam quistos.

---

## 11. Servidor e antifraude

**O save é do servidor, não do navegador.** Online, o jogo não guarda nada do progresso na máquina do jogador. Só preferências (idioma, volume) ficam locais. O save sobe no máximo a cada 45 segundos, na hora em eventos importantes e ao fechar a aba.

**O servidor sorteia tudo que vale dinheiro.** O cliente não decide: a raridade da forja, os drops únicos e quais materiais saem na versão negociável são rolados no servidor. Item negociável nasce com certificado.

**Os tetos.** O servidor confere cada progresso contra limites por hora e por dia: XP por hora, unidades de cada material por hora de caça, unidades negociáveis por dia.

Esses tetos **não são travas de segurança arbitrárias: são um retrato do conteúdo.** Eles respondem "qual o máximo que um jogador honesto consegue?". Por isso **sobem quando o jogo passa a pagar mais** — manter um teto velho não deixa o servidor mais seguro, faz ele **recusar progresso legítimo**, que é a pior falha possível num antifraude. Quando a quinta zona entrou, o teto de XP subiu de 25 mil para 32.600, derivado da conta e não escolhido.

**A IA de operações** (um vigia a cada 5 minutos e um auditor de hora em hora) observa o jogo e só **aconselha**. A única coisa que ela pode fazer sozinha é **ligar** uma pausa; desligar é sempre do dono.

**Ambientes.** Supabase e Vercel. Hoje existe só o de teste; o de produção será criado quando houver data de lançamento.

---

## 12. Onde o jogo está hoje

**Não há data de lançamento.** O playtest de 31/10 foi cancelado em 28/10, e com ele caiu o congelamento de conteúdo.

**Pronto e no ar no ambiente de teste:** o jogo completo — Caça, Masmorra, Mineração, Lenhador, Horta, Forja, Ofícios, Pedidos, Missões, Códice, Habilidades, Inventário, Passe, Mercado, Convites e Calendário.

**Pronto no código, ainda não publicado** (a reforma de classes de 28/10, oito fases das nove):

| Fase | O que entregou |
|---|---|
| 1 | 13 materiais, fibra na Horta, estação de Tecelagem |
| 2 | 60 peças de armadura: couro e tecido, seis tiers cada |
| 3 | 24 armas: arco, besta, cajado e cetro |
| 4 | O motor de habilidades: rotação, recargas, oito efeitos |
| 5 | As 21 habilidades e a tela Táticas |
| 6 | A afinidade de classe e o selo |
| 7 | Filtro da Forja, quinta zona de caça, provas de mercado |
| — | 115 ícones novos; Stripe fora do servidor |

**O que falta:**

- **Fase 8, o equilíbrio:** fechada para os tiers 6 e 4 (a tabela de eixos de `classAxes.test.ts` trava cada classe no seu eixo); o tier 3 ficou fora do alvo por decisão. Ver `docs/CLASSES_E_EQUIPAMENTOS.md`, seção 5.1.6.
- Limpar os textos de Stripe na interface e quatro ajustes de interface pendentes.
- Arte própria do monstro da zona 5 (o cenário já tem).
- Publicar tudo no ambiente de teste.

**Decisões do dono ainda abertas:**

- Quanto custará o Passe da Temporada 2 (adiado: "nem passamos pela Temporada 1").
- Textos legais: termos de uso e regulamento da Liga, com critério de desempate perto do nível 100.
- Produção: plano pago do Supabase, carteira Solana real, endereço oficial do site.
- Se os outros slots de equipamento (elmo, luvas, botas, mão secundária, anel) também passam a conceder habilidades.

---

*Documentos de detalhe no repositório: `RESUMO_DO_PROJETO.md` (estado operacional e ambientes), `docs/CLASSES_E_EQUIPAMENTOS.md` (a reforma de classes por inteiro), `docs/PAGAMENTOS_DESCARTADOS.md`, `docs/MARKET_SOLANA.md`, `docs/PASS_SALES.md`, `docs/SEASON_RANKING.md`, `docs/ADMIN.md`, `docs/AI_OPS.md`, `docs/BALANCE_CHANGES.md`.*
