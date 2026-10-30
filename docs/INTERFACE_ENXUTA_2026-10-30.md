# Interface enxuta — 30/10/2026

Pedido do dono (via DIRETOR): a interface "tem coisa demais"; como enxugar. Medido no preview `dev-offline` em **375×812**, herói da semente (nível 40, ouro 48K, sem Passe), com um medidor de JavaScript que lê a posição e a altura de cada bloco. Nenhum arquivo do jogo foi tocado; servidor e aba foram fechados. As telas de Caça foram só lidas no código (outra frente está mexendo nelas agora); Mercado, Convites e Calendário só existem online, então ficaram de fora da medição.

## 1. Resposta em uma frase

**O peso não está numa tela grande, está em três coisas repetidas em todas**: o menu com 18 entradas (20 online) que repete o que o Acampamento já mostra; o título dito duas ou três vezes por tela (barra do topo + cabeçalho da página + título do painel, e nos modais ainda o título do modal); e três telas que empilham tudo numa coluna só: Personagem (3,9 telas de altura), Forja (6,4) e Passe (9,1, com o botão de comprar na última).

## 2. O que foi medido, tela por tela

Em todas: barra do topo de 56 px; sobram 756 px antes de rolar. "Blocos" = painéis com borda que o jogador enxerga como caixas.

| Tela | Blocos antes de rolar | Altura total | O que o jogador veio fazer | O que está no caminho |
|---|---|---|---|---|
| **Acampamento** | 4 (cabeçalho 83, herói 162, Atividade 303, Ações rápidas cortada) | 1,7 telas | ver o que está rodando; coletar ou começar | sem Passe, o painel Atividade abre com botão trancado "Resgatar tudo" + linha "Exclusivo do Passe" + botão "Ver o Passe" (≈130 px) **antes** de qualquer atividade; "Ações rápidas" repete o menu; "Progressão" repete Personagem |
| **Personagem** | 2 (herói 102, Equipamento 820) | **3,9 telas** | trocar uma peça; gastar pontos | Equipamento = grade 480 + conjunto/afinidade 340 em texto; Inventário inteiro embutido (714); **Atributos 1.043 px** na terceira tela (quadro de combate + 4 atributos de 106 px cada); as dobras (Habilidades, Títulos) só no fim |
| **Forja** | 4 (abas 96, duas fileiras de chips 124, lista, ficha) | **6,4 telas** | forjar a próxima peça | lista de 31 armas × 89 px a partir do **tier 1** para um herói nível 40, zero marcadas como "dá para forjar"; a ficha de 924 px entra no meio da lista; o filtro de classe ocupa fileira própria sempre |
| **Inventário** (modal) | 5 (título do modal 63, cabeçalho 42, abas Mochila/Baú 50, busca+chips 140, grade) | 1,5 | achar um item e usar/equipar | o nome "Inventário" aparece duas vezes antes da grade; 230 px de controle antes do primeiro item |
| **Táticas** | 2 (cabeçalho 149, Rotação 577) | 1,6 | ver e trocar a rotação | o cabeçalho carrega a regra em prosa; a Rotação tem 4 linhas + **4 notas de texto** + 3 botões; os grupos de técnicas (o que escolher) ficam abaixo da dobra |
| **Horta** (modal) | 2 (resumo 195, Canteiros 810) | 1,6 | colher e replantar | 290 px antes do primeiro canteiro; 4 canteiros trancados têm a mesma altura dos abertos |
| **Mineração / Lenhador** (modal) | 2 (resumo 128, painel 324) | cabe em 1 | começar ou coletar | **já está no tamanho certo**; com sessão ativa entra um painel dourado de ≈250 px, ainda cabe |
| **Pedidos** (modal) | nota 50 + 3 cartões (334, 411, 314) | 1,8 | aceitar ou coletar | cada cartão tem duas fileiras de chips + raridade + requisitos + recompensa + botão |
| **Passe** | 3 (banner 152, Vantagens 747, Trilha começa) | **9,1 telas** | resgatar o nível; comprar | a Trilha são 30 níveis **em coluna** no celular (4.446 px), depois Destaques (1.073); o botão **"Ativar"/comprar está em y = 6.750**, no rodapé, que não é fixo |
| **Loja** (modal) | 4 abas 103, Consumíveis 674 (3 cartões de 194) | 2,1 | comprar uma poção ou gema | Gemas (681) só na segunda tela; cartões de 194 px para itens de uma linha |
| **Ofícios** | 6 abas em 2 fileiras 148, lista com ficha | 1,35 | refinar | ok; só as abas em duas fileiras pesam |
| **Habilidades** | abas 86, coluna 540, dock 234 | 1,6 | gastar pontos | o bloco Conjunto 1/2 + Aplicar fica a 1.067 px |
| **Missões** (modal) | 4 abas 96, Sequência de login 342, nota 33, cartões 151 | 1,5 | resgatar | a sequência de 7 dias ocupa 342 px antes da primeira missão |
| **Masmorra** (modal) | bioma 369 (com aviso de CP 76), Profundezas 174, Poção automática 241 | 1,9 | entrar | o botão Entrar está no primeiro painel: certo; Poção automática e Progresso (518) poderiam dobrar |
| **Códice** (modal) | abas + 8 painéis | 5,2 | consultar | lista completa aberta |

Capturas de prova no mesmo diretório deste arquivo: `acampamento_375.jpg`, `menu_375.jpg`, `personagem_375.jpg`, `passe_375.jpg`.

### Caça (só lido no código, outra frente está mexendo)

O rumo dos 3 passos (escolher lugar → escolher dificuldade → caçar) está certo e bate com o Raven Idle. O que ainda não bate: `HuntRunning.tsx` monta **sete painéis** (alerta, medidor, resumo, Coletado, Únicos, Sub-nível, Congelado) onde a referência tem tempo, dois retratos e duas vidas. Se a frente parar em 2 blocos (estado da caça + o que caiu) e dobrar o resto, chega lá; se mantiver os sete, só mudou a ordem.

## 3. O menu: 18 entradas offline, 20 online

| Grupo | Entradas hoje |
|---|---|
| (sem título) | Personagem, Habilidades, Táticas, Caça, Masmorra, Missões, Códice, Calendário |
| Profissões | Mineração, Lenhador, Horta, Ofícios |
| Equipamento | Forja, Inventário |
| Economia | Pedidos, Passe, Convites (online), Loja, Mercado (online) |
| (sem título) | Configurações |

Mineração e Lenhador já são **o mesmo componente** (`GatheringModal` com `kind`); Personagem já **contém** o Inventário; Habilidades e Táticas são as duas metades de "como o herói luta". Nada disso precisa de entrada própria.

**Proposta: 8 entradas.**

| Nova entrada | Vira abas dentro | Observação |
|---|---|---|
| Acampamento | — | continua o botão da marca |
| Herói | Personagem · Habilidades · Táticas | o badge "pontos para gastar" sobe para "Herói" |
| Caça | — | |
| Masmorra | — | |
| Profissões | Mineração · Lenhador · Horta · Ofícios | uma tela, quatro abas; Mineração e Lenhador já são a mesma |
| Forja | — | Inventário entra como a aba "Mochila" aqui ou fica só em Herói (já está lá) |
| Loja | Loja · Pedidos · Mercado (online) | |
| **Passe** | — | **conteúdo pago: fica com entrada própria e visível** |

Missões vira o ícone com badge na barra do topo (é o único item que o jogador abre por aviso, não por vontade). Códice, Calendário, Convites e Configurações vão para a engrenagem (Configurações já está na barra do topo). De 20 para 8 no menu e nada some: tudo fica a um toque.

## 4. Dez cortes, do maior ganho ao menor

Cada um diz o que some, o que vai para um toque de distância, e o risco. **(Passe)** marca conteúdo pago, que não pode sumir.

1. **Passe: rodapé fixo e trilha deitada.** Hoje o botão de comprar/ativar e o "Resgatar todos" estão 9 telas abaixo. Some: nada. Vai para a tela: o rodapé vira fixo no pé (CSS `position: sticky; bottom: 0`) e a trilha passa a rolar de lado também no celular (já é assim no desktop), aberta no nível atual. Ganho: a ação principal da tela paga sai de 6.750 px para 0. Custo: CSS. Risco: nenhum; as 30 recompensas continuam na trilha. **(Passe)**
2. **Forja: a lista começa no que o herói pode forjar.** Some: nada. Dobra: os tiers abaixo do nível do herói viram "Anteriores (n)" fechado; as receitas que **dão para forjar** sobem para o topo; o filtro de classe vira um chip dentro da fileira de categorias ou um botão "Filtrar". Ganho: 6,4 → ≈1,5 telas. Risco: quem quer forjar tier 1 para reciclar abre a dobra; o aviso "ingrediente vestido" continua na ficha.
3. **Menu 20 → 8** (seção 3). Some: 12 entradas. Vai para um toque: as abas de cada tela-pai e a engrenagem. Risco: os badges de "pede atenção" (Habilidades, Missões, Pedidos prontos, Horta pronta) precisam migrar para a entrada pai e para o ícone da barra do topo, senão o jogador perde o aviso de coleta.
4. **Acampamento com um bloco a menos e a venda do Passe em uma linha.** Some: "Ações rápidas" (repete o menu) e "Progressão" (repete Personagem e Profissões). Sem Passe, os três elementos de venda ("Resgatar tudo" trancado + linha + "Ver o Passe") viram **um** botão trancado com o cadeado. Ganho: 1,7 → 1 tela; a primeira atividade sobe ≈280 px. Risco: "Resgatar tudo" é vantagem prometida do Passe; continua visível, só menor. **(Passe)**
5. **Personagem: Atributos vira dobra; conjunto e afinidade viram uma linha.** Some: nada. Dobra: Atributos (1.043 px) vira uma dobra como Habilidades e Títulos, com "8 pontos para gastar" no resumo da dobra e o botão "Sugerir"; o quadro de combate fica dentro dela; conjunto + afinidade (340 px de texto) viram uma linha com toque para abrir. Ganho: 3,9 → ≈2 telas. Risco: pontos sem gastar; o badge do menu e a linha da dobra avisam.
6. **Um título por tela.** Some: o `PageHeader` dentro dos modais (o `ModalShell` já tem título) e o subtítulo em prosa das páginas (Acampamento 83 px, Táticas 149 px). Regra: um título, subtítulo só quando é um número (nível, ouro, espaço). Ganho: 40 a 150 px em **todas** as telas. Risco: nenhum.
7. **Táticas: uma linha de estado, técnicas antes de Aplicar.** Some: três das quatro notas (dica, "automática", "tudo aplicado + quando vale") viram uma só linha de estado. Sobe: os grupos de técnicas vão para antes dos botões. Risco: a nota de **técnica que saiu com a troca de arma** (`tactics.dropped`) é a única que avisa de perda silenciosa; essa fica.
8. **Horta: resumo vira cabeçalho; trancados viram um cartão.** Some: o painel de resumo (195 px) vira o subtítulo (nível · canteiros · próxima planta). Dobra: os 4 canteiros trancados viram um cartão "+4 canteiros (Nv 15, 25, 40, 60)". Ganho: primeiro canteiro em ≈120 px. Risco: o aviso de **mochila cheia** (`garden.bagFull`) já fica acima dos canteiros e continua.
9. **Pedidos: cartão de uma linha.** Some: as duas fileiras de chips e o bloco de requisitos no cartão fechado; sobra destino · tempo · recompensa · botão. Toque: o cartão abre para mostrar requisitos. Ganho: 3 pedidos em 1 tela. Risco: "faltam itens" tem de continuar no botão (já é o rótulo do botão).
10. **Loja e Missões: menos altura por item.** Loja: cartões de 194 px para itens de uma linha viram linha de 72 px (ícone · nome · preço · botão) e Gemas sobe para a mesma tela. Missões: a Sequência de login (342 px) vira uma linha de 7 pontos. Risco: a nota "com o Passe, um dia perdido não quebra a sequência" é promessa do Passe; fica como rodapé da linha. **(Passe)**

Se for para escolher um corte só: **o 1** (é a tela paga, e a ação está na última das nove telas). Se dois: 1 e 2. O 3 é o que mais muda a sensação de "coisa demais", mas mexe em `App.tsx`, por isso vem depois.

## 5. A regra, e se dá para medir

**Regra única:** *em 375×812, a ação que a tela existe para fazer fica acima de 700 px sem rolar; no máximo 3 blocos aparecem antes da dobra; e nenhuma tela passa de 3 telas de altura sem o excesso estar dobrado.*

Aplicada hoje, falham: Acampamento (4 blocos; a atividade real fica depois da venda), Personagem (3,9 telas), Forja (6,4 telas e 4 blocos), Passe (9,1 telas; ação em 6.750 px), Inventário (5 blocos), Códice (5,2 telas). Passam: Mineração, Lenhador, Ofícios, Masmorra, Táticas (por pouco), Horta, Habilidades, Missões, Loja, Pedidos.

**Dá para medir, em duas camadas:**

- **Guarda barata na suíte (vitest, jsdom):** o jsdom não calcula altura, mas conta blocos. Um teste que renderiza cada tela com `useIsPhone` devolvendo `true` e o save da semente, e falha se houver **mais de 3 `.ui-panel` de primeiro nível antes do primeiro painel dobrado** ou se um `ModalShell` contiver um `PageHeader` (título duplicado). Protege a regra dos blocos e a regra do título; custa um arquivo de teste.
- **Medição de pixels (ferramenta, não portão):** um script em `scripts/tools/` que abre o `dev-offline` com Playwright a 375×812 e lê, para cada tela, `scrollHeight / clientHeight` do `.ui-screen` ou `.ui-modal-body` e o `top` do botão principal (`.pa-buy-btn`, `.hunt-start`, `.dm-enter`, `.fg-panel .ui-btn`). O repositório não tem Playwright; o trecho abaixo é o que usei no console e já serve para rodar à mão:

```js
// no console do jogo em 375x812: altura total em "telas" e os blocos antes da dobra
const vh = innerHeight;
const sc = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY));
const blocks = [...document.querySelectorAll('.ui-pagehead, .ui-panel, .ui-tabs')].filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top < vh; });
({ telas: sc ? (sc.scrollHeight / sc.clientHeight).toFixed(1) : 1, blocosAntesDaDobra: blocks.length });
```

## 6. O que não entra aqui

Nenhum número de jogo, nenhuma regra e nenhum texto novo para o jogador foram propostos; todo corte acima é de apresentação (ordem, dobra, abas, CSS). O que precisa do dono: aprovar a lista de 8 entradas do menu (seção 3) e confirmar que "Ações rápidas" e "Progressão" podem sair do Acampamento.
