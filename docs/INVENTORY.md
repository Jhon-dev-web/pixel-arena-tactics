> **2026-10-11:** a moeda rara (`shards` no código e nos saves) agora se chama **Runas** (pt) / **Runes** (en) para o jogador; neste documento ela aparece como "Fragmento(s)" / "Shards", o nome antigo.

# Inventário único

Regras e números do inventário (Rodada 5). Substitui a antiga Bolsa de Caça. O código mora em `src/game/inventory.ts` (espaços, colocação, capacidade),
`stash.ts` (Baú), `merchant.ts` (mercador), `bagActions.ts` (descartar), `itemUses.ts` ("Usar em..."), `huntLifecycle.ts` (resgate da caça),
`legacyPouch.ts` (migração). Os números de balanceamento e a simulação estão em `BALANCE_CHANGES.md`, "Rodada 5".

## 1. Pilhas e espaços

- Todo empilhável (materiais, consumíveis, equipamento empilhável como relíquias) guarda no máximo **99 por espaço** (`STACK_LIMIT`). Um tipo com mais unidades
  ocupa `ceil(qtd / 99)` espaços: 250 de ferro = 3 espaços (99 + 99 + 52).
- Cada peça de equipamento guardada (instância) ocupa **1 espaço**. Peça equipada não conta.
- O save continua guardando **quantidades por tipo**; os espaços são derivados. Não existe arrumação por espaço nem arrastar e soltar.
- Uma única função pura decide tudo: `placeUnits` (e `addWithOverflow`, `canAdd`, `addForced`, `fitsBag` em cima dela). Primeiro as unidades vão para as
  **pilhas parciais** que já existem (não custam espaço), depois para espaços novos **na ordem que o chamador dá** (a caça dá do mais raro para o mais comum).
  O que não cabe volta como `leftover`. Nenhum chamador calcula espaços sozinho.
- Uma ação deliberada que muda a bolsa (forjar, refinar, colher, desmontar, comprar, resgatar prêmio do Passe) é aceita quando o resultado não ocupa mais
  espaços do que a bolsa tem, ou, numa bolsa que já está acima do limite, quando ela não cresce (`fitsBag`).
- Bolsa acima do limite é um estado suportado (Passe que acaba, save antigo com pilhas grandes): **nada é apagado**, só não entra nada que ocupe espaço novo.

## 2. Capacidade

| Origem | Espaços |
| --- | --- |
| Base de uma conta nova | **26** |
| Degraus pagos | 30 (250 Ouro) · 35 (500) · 40 (1 000) · 45 (2 000) · 50 (4 000) · 55 (7 500) · 60 (12 500) · 65 (20 000) · 70 (30 000) · 75 (45 000) · 80 (65 000) · 85 (90 000) · 90 (120 000) · 95 (160 000) · **100 (210 000)** |
| Passe de Aventureiro (dono) | **+20% da capacidade, arredondado para cima, no mínimo +5** (`T.battlePass.bagBonusPct` / `bagBonusSlots`, uma só função: `passBagBonus` em `inventory.ts`): 26 → +6, 60 → +12, 100 → +20; para sempre, o Passe não expira mais |
| Passe de Aventureiro (dono), no Baú | +10 espaços no **Baú** (`T.battlePass.stashBonusSlots`), para sempre; soma com os degraus e com as Escrituras do Baú |
| Antigos tiers da Bolsa de Caça | +2 por tier acima do 1, **uma vez**, permanente (`inventoryBonusSlots`) |

Saves antigos mantêm a capacidade que já tinham (o piso só sobe, nunca desce): quem tem 30 continua com 30. Os degraus continuam a curva dos seis primeiros
(dobra no começo, depois desacelera) até 100.

## 3. Caça: o resgate coloca o prêmio no inventário

O motor continua simulando a sessão **no momento em que ela é encerrada**; o prêmio congelado (`pendingHuntReward`) guarda ouro, XP, XP do Passe, as peças
únicas e **todos** os materiais sorteados (`drops`). Nada toca a bolsa até o resgate.

No resgate (`planHuntClaim`, a mesma função que a tela de recompensa e a prévia da caça em andamento usam):

1. as **peças únicas** pegam um espaço cada, antes de qualquer material (uma pilha de farrapos nunca toma o espaço de uma peça única); as que não cabem ficam no
   prêmio pendente, como antes;
2. as unidades que o jogador já tinha antes desta regra (`owed`, ver migração) entram, e o que não couber **continua pendente**;
3. os materiais da sessão entram nos espaços livres **daquele momento**, do mais raro para o mais comum, pilhas parciais primeiro;
4. o que não coube **fica para trás**: aparece em vermelho com o motivo e não volta. Ouro e XP nunca se perdem.

A tela de recompensa tem o atalho "Abrir inventário" para arrumar espaço antes de resgatar (a tela fica de lado e volta ao abrir a Caça).

Na tela da caça em andamento: "Inventário: 41/50 — cabe tudo" ou "Faltam 2 espaços: 136 de Farrapo de Couro ficariam para trás", e "Inventário cheio em ~2h10
(estimativa pelo ritmo atual)". Na seleção: o espaço livre e um aviso quando o herói encheria o inventário antes do limite de coleta, pelo rendimento estimado.
Na Home, o contador do inventário fica âmbar a partir de 85 % e vermelho quando cheio.

## 4. O que cada fonte faz com a bolsa cheia

Regra: ação deliberada nunca destrói em silêncio; só a coleta passiva (Caça, Mineração, Lenhador) pode deixar excesso para trás, e sempre mostrando.

| Fonte | Bolsa sem espaço |
| --- | --- |
| Caça (resgate) | enche o que cabe, o resto **fica para trás** (mostrado antes e depois); peças únicas e `owed` ficam pendentes |
| Mineração / Lenhador (coleta) | enche o que cabe, o resto **fica para trás**; XP de ofício e ouro são pagos inteiros; a janela mostra "N ficariam para trás" antes de coletar |
| Horta (colher) | **bloqueia** só o canteiro cujo rendimento não cabe: continua pronto, nada é pago nem perdido; mensagem na tela e no aviso |
| Masmorra (fim de corrida) | **entra mesmo assim** (`addForced`): a corrida já terminou, a bolsa pode ficar acima do limite (comportamento que já existia); peças únicas de chefe idem |
| Passe de Batalha (resgatar nível) | **bloqueia** o prêmio de item: continua resgatável; ouro, fragmentos, gemas e cosméticos sempre entram; "resgatar tudo" pula os bloqueados |
| Forja (peça) | **bloqueia** quando o resultado (peça nova menos ingredientes e pilhas que esvaziam) não cabe |
| Ofícios (refino, alquimia) | **bloqueia** com aviso no cartão; comer uma pilha inteira para fazer um item sempre libera o espaço dele |
| Loja (comprar) | **bloqueia** ("Mochila cheia"); o limite de 20 por tipo da Loja continua |
| Desmontar | **bloqueia** com motivo quando o reembolso não cabe, contando a chance do Essence bônus como se tivesse saído; a própria peça libera o seu espaço |
| Remover peça equipada | **bloqueia** (já era assim) |
| Pedidos, missões, expedição antiga | só pagam ouro, XP e fragmentos: não usam a bolsa |
| Baú: guardar / pegar | move **o que cabe** (pilhas parciais primeiro), diz quantos foram; nada se perde |
| Mercador, Descartar | só reduzem a bolsa |

## 5. Maneiras de esvaziar

- **Usar em...** (detalhe do item): lista onde o item é consumido, derivado dos dados reais de receita (`usesOf`): Forja (receitas de equipamento), Ofícios (refino e
  alquimia), aprimorar peças, reforja, Pedidos (e as ofertas que estão no quadro agora), Horta (Adubo), melhorias do Baú. Cada entrada com tela abre essa tela já
  focada na primeira receita que usa o item. Um teste garante que todo material e consumível tem ao menos um uso (ou está na lista de exceções, hoje vazia).
- **Baú do acampamento**: segundo recipiente com a mesma regra de 99 por espaço. Começa com **20** espaços; cada melhoria dá **+10**, até **100** (8 melhorias).
  Só guarda empilháveis (instâncias de equipamento ficam no inventário). **Receitas, pedidos e melhorias consomem só do inventário**, nunca do Baú; toda linha
  "falta X" diz quando o Baú tem o que falta ("você tem 40 no Baú") com "trazer N" quando há espaço. Custos (ouro; saem do inventário):

  | Nível | Espaços | Ouro | Madeira refinada | Barras |
  | --: | --: | --: | --- | --- |
  | 1 | 30 | 100 | 4 cabos comuns | 3 barras de cobre |
  | 2 | 40 | 250 | 8 cabos comuns | 6 barras de cobre |
  | 3 | 50 | 600 | 5 cabos de carvalho | 8 barras de cobre |
  | 4 | 60 | 1 200 | 8 cabos de carvalho | 3 aços |
  | 5 | 70 | 2 500 | 5 cabos de ébano | 5 aços |
  | 6 | 80 | 4 500 | 8 cabos de ébano | 4 lingotes de prata |
  | 7 | 90 | 8 000 | 5 cabos élficos | 3 barras de ouro |
  | 8 | 100 | 14 000 | 4 cabos ancestrais | 2 obsidianas refinadas |

- **Vender ao mercador** (detalhe do item e aba "Vender" da Loja), só do inventário:
  - material: `max(1, floor(15 % do valor de referência de economy.ts))`, ou o `sellValue` antigo quando ele for menor (na prática, sempre os 15 %);
  - consumível: o `sellValue` que já tinha (0 = não vende: itens só do Passe, tickets, catalisadores). A restrição antiga "consumíveis não podem ser vendidos"
    deixou de valer;
  - equipamento (instâncias e peças únicas) **não** é vendido: fica para desmontar e, no futuro, para o mercado entre jogadores;
  - quantidade 1 / 10 / pilha / tudo; vender o tipo inteiro pede uma segunda confirmação;
  - **orçamento diário** de Ouro: `30 + 2 × nível do personagem` (`T.merchant`), renova à meia-noite local (mesma virada das sessões de Masmorra),
    mostrado como "orçamento de hoje: x / y". Quando acaba, o mercador não compra mais nada até a virada; a venda corta no que o orçamento paga.
  - **Anti-arbitragem**: um teste varre todas as receitas de refino, alquimia e a volta forjar-desmontar-vender e exige "custo da receita + preço de venda das
    entradas >= preço de venda da saída". Resultado: nenhuma violação, sem precisar baixar nenhum preço.
- **Descartar**: 1 / 10 / pilha / tudo de um tipo, com confirmação, sempre disponível. Nunca descarta a cópia equipada.

## 6. Migração (sem trocar a chave do save)

Rodam no carregamento (`legacyPouch.ts`), em um save que ainda tem `huntPouch`:

- **tier pago** da bolsa acima do 1 vira capacidade permanente: +2 espaços por tier acima do 1 (`inventoryBonusSlots`), concedido **uma única vez**
  (`pouchMigrated` fica registrado; um `huntPouch` que voltasse num payload não concede de novo);
- **itens da bolsa** entram no inventário se couberem (do mais valioso para o menos); o que não couber **não se perde**: fica em `owed` no prêmio pendente
  (criado na hora se não houver um) e entra assim que houver espaço;
- um prêmio pendente escrito pela regra antiga (registrava a capacidade da bolsa) tinha os `drops` já dentro da bolsa: seus `drops` são zerados para não entrar duas vezes;
  o `lost` antigo continua só como informação;
- os campos da bolsa saem do save; pilhas acima de 99 carregam inteiras (500 de um material = 6 espaços), mesmo acima do limite;
- `stash` e `merchant` são campos novos com padrão vazio: saves antigos carregam com o Baú nível 0 vazio.

## 7. Testes

`inventoryStacks.test.ts` (matemática de pilhas, regra de colocação, resgate com espaço parcial, migração da bolsa, comportamento de cada fonte),
`stashMerchant.test.ts` (Baú, melhorias, preços, varredura de arbitragem, orçamento e virada do dia, descartar, `usesOf`), além dos testes antigos adaptados.
