# Melhorias de identidade, apresentação e usabilidade — Arena Idle

## Continuação de 21/10 — mockup de Personagem e revisão das outras áreas

O dono pediu um mockup da página Personagem e uma consulta visual às demais áreas do jogo. A proposta de Personagem está **em revisão**, sem aprovação de implementação até aqui.

- [Abrir o mockup de Personagem](docs/mockups/personagem-proposta.html).
- [Orientações do mockup para o Claude](docs/mockups/PERSONAGEM_PROPOSTA.md).
- [Revisão visual atual das demais interfaces](docs/REVISAO_INTERFACES_JOGO.md).

A revisão complementar foi feita no jogo de teste autenticado; os documentos dizem quais telas/estados foram realmente vistos e quais validações faltam. Prioridades sugeridas: aproximar equipamentos/inventário, compactar produção e coletas, elevar a trilha do Passe ativo. Nenhuma dessas propostas altera automaticamente regras do jogo ou autoriza publicação. O mockup usa dados fictícios e assets existentes, sem acesso à conta. Não houve alteração de código do jogo nesta entrega.

## Decisão mais recente do dono — Visão geral SEM GRÁFICOS (21/10/2026)

**Claude: leia esta seção antes das recomendações antigas do administrador.** O dono viu e aprovou a direção do mockup e pediu que ele ficasse disponível para você. Pedido explícito: **“NÃO QUERO GRÁFICOS. APENAS DADOS.”**

Referência visual aprovada: [abrir o mockup da Visão geral](docs/mockups/admin-visao-geral.html). Arquivo local completo em `C:\Users\haduk\pixel-arena-tactics\docs\mockups\admin-visao-geral.html`; pode ser aberto no navegador, sem login. Expanda as linhas para ver os detalhes e a tabela de histórico. É uma referência visual, não uma implementação do painel.

### Composição aprovada para orientar a próxima implementação

- Quatro indicadores no topo: online estimado, jogadores ativos hoje, contas criadas e Passe válido na temporada.
- Pendências em lista curta: pagamentos sem correspondência e jogadores com alertas; preservar outras pendências reais que o backend informar.
- Dois blocos de dados alinhados: Passe de Aventureiro e Mercado. Mostrar valores, rótulos e unidades, sem visualizações gráficas.
- Histórico diário em **tabela expansível**, não em gráfico. O mockup demonstra sete dias; isso não exige reduzir a consulta atual de 30 dias nem excluir dados existentes.
- Itens/circulação e estado das rotinas em listas expansíveis.
- Interface neutra, compacta e legível, com separadores discretos, temas claro/escuro e adaptação ao celular. Sem decoração fantasy, cards gigantes ou cores diferentes para cada número.
- **Zero gráficos nesta Visão geral, inclusive em detalhes fechados:** sem linhas, barras, pizza, sparklines ou medidores. Apresentar metas e distribuições com valores textuais/tabelas, se necessárias.

### Cuidados para quem continuar

1. Todos os números, horários, saldos e estados do mockup são **fictícios**. Não copiá-los para a aplicação como dados reais; usar as consultas existentes.
2. Preservar a distinção entre Passe válido e histórico, compras e concessões, dados reais e teste, USDC e SOL. Não somar moedas diferentes.
3. Preservar carregamento, vazio, erro parcial, dados desatualizados, indicação do ambiente, horários por fonte e atualização/reconsulta. Uma consulta que falhou não equivale a zero nem a operação saudável.
4. Não remover métricas importantes só porque o mockup é resumido. Organizá-las em tabelas/listas expansíveis ou nas páginas já existentes. Não redesenhar outras páginas sem pedido.
5. O menu do mockup é ilustrativo. Reutilizar a navegação real do administrador; o código de exportação/preview e sua persistência local não devem ser incorporados ao app.
6. Não alterar jogo, portal, autenticação, permissões/RLS, RPCs, economia, saves ou regras de negócio para reproduzir este layout. Preservar o trabalho paralelo já presente no repositório.
7. As sugestões antigas deste documento sobre manter ou tornar gráficos acessíveis **não se aplicam à nova Visão geral**: prevalece a decisão acima. O resumo e o código atual também prevalecem sobre diagnósticos antigos já resolvidos.
8. Antes de implementar, conferir `AGENTS.md`, `RESUMO_DO_PROJETO.md` e o estado atual dos arquivos. Validar mobile/desktop, ambos os temas e estados de falha; seguir os testes do projeto. Esta entrega não executou testes da aplicação nem publicou mudanças.

**Entrega desta etapa:** mockup salvo para consulta e esta orientação. Nenhum código do administrador foi alterado por esta entrega. Sem commit, push ou deploy. A aprovação visual não concede autorização adicional para banco ou publicação.

---

Atualização de escopo: a seção 9 acrescenta a revisão do administrador solicitada depois da primeira entrega. As seções anteriores continuam sendo a avaliação do portal e do jogo.

Data: 21/10/2026. Documento para revisão do dono e leitura pelo Claude Code.

## 1. Escopo e como usar este documento

O pedido foi avaliar o jogo e o portal para reduzir a aparência genérica associada a projetos feitos por IA, **criando apenas este arquivo**. Nenhuma proposta abaixo foi implementada. Este documento não autoriza automaticamente redesign, geração de imagens, alteração de regras, commit, publicação ou mudanças no banco.

Li primeiro `RESUMO_DO_PROJETO.md` e depois o código relevante. A base local consultada estava na branch `claude/project-thread-ppdm57`, commit `d1c4522`. Havia previamente `supabase/.temp/` não rastreado; não foi alterado por esta análise. Quem continuar deve verificar o estado atual, pois outros agentes podem ter trabalhado depois.

Evidências consultadas:

| Fonte | O que efetivamente foi observado | Limite da evidência |
| --- | --- | --- |
| Portal de teste, ao vivo | Home, Temporada, Passe e Sistemas em `https://arena-idle-portal-teste.vercel.app/pt/`; imagens, hierarquia e textos | Janela de aproximadamente 1176 × 706; não é uma validação de todos os breakpoints |
| Jogo de teste, ao vivo | Login em `https://arena-idle-teste.vercel.app/`, aproximadamente 1280 × 720 | Sem sessão autenticada; não criei conta nem acessei um personagem real |
| Capturas do próprio portal | `portal/public/img/shots/pt/home.webp`, `hunt.webp`, `inventory.webp`, `forge.webp`, em 1440 × 900 | Capturas promocionais existentes, não uma sessão atual autenticada; data de arquivo não prova data da captura |
| Capturas mobile existentes | `smoke-out/screens/020_mid_390x800_home.png`, `023_mid_390x800_Ca_a.png`, `031_mid_390x800_Forja.png` | Arquivos datados de 16/10/2026; evidência histórica, requer repetir no build atual. `smoke-out/` pode não existir em outro checkout |
| Código local | Componentes de Home, Caça, login, navegação, UI compartilhada, estilos, textos e regras específicas citadas abaixo | Não certifica que o deploy está no mesmo commit |

Não executei build, smoke automatizado, testes, simulações, autenticação, pagamentos ou migrations. A entrega é documental. As abas abertas para a análise foram fechadas.

## 2. Diagnóstico principal

O jogo já tem identidade aproveitável: nomes de lugares, materiais reconhecíveis, equipamento que muda o herói, progressão por profissões e uma interface de inventário própria de RPG. O problema não é simplesmente usar roxo, dourado ou imagens elaboradas.

O que enfraquece a personalidade é a combinação de quatro fatores:

1. **O portal apresenta primeiro uma fantasia cinematográfica e comercial; o produto real é um RPG idle em pixel art.** A pessoa vê arena monumental, troféu, carta do Passe e Mercado antes de conhecer o ritmo real do jogo.
2. **Há repetição de fórmulas de apresentação.** Ícone dentro de círculo, título grandioso, parágrafo genérico, borda dourada; depois outra grade com a mesma função. A página parece montada por blocos intercambiáveis.
3. **Algumas telas dão o mesmo peso a informações diferentes.** Equipamentos já conhecidos, atividade atual, avisos e ações precisam ter prioridades distintas. Isso pesa especialmente no celular.
4. **Promessas e capturas nem sempre representam bem o estado atual.** Uma frase errada sobre XP ou uma captura com mochila acima do limite prejudica a confiança mais do que a falta de um efeito visual.

“Cara de IA” é aqui um julgamento de direção visual/editorial, não uma afirmação sobre a origem dos assets. Não há evidência suficiente para atribuir autoria automática a cada imagem, e isso não é necessário para corrigir os problemas.

Direção recomendada: **um RPG de preparação, coleta e descoberta, com aparência de um mundo específico e decisões fáceis de ler**. A arte pode ser épica; a explicação do produto deve ser concreta.

## 3. O que deve ser preservado

- Nome atual **Arena Idle**, conforme o resumo; não trazer “Arena Duel” de volta aos textos públicos.
- Background atual do login: `public/assets/backgrounds/login-background-v2.png`. O dono já o aprovou; não gerar substituto como parte destas melhorias.
- Arte aprovada do portal: trabalhar inicialmente com composição, escala e contexto. Não descartar arena, troféu e carta por preferência estética de um agente.
- Modelo de interface aprovado do mercado; paleta escura, dourado funcional e itens com cor de raridade.
- Departure Mono para leitura e Press Start 2P para títulos no jogo, usando os quatro tamanhos de `src/ui/tokens.css`.
- Sprites, nomes de materiais, ícones de itens e aparências de armadura existentes. Conferir se há asset pronto antes de solicitar outro.
- O caráter idle: não transformar a Caça em uma tela que exige assistir ao combate.
- Todos os números, fontes de recompensa, tempos, condições, vantagens reais do Passe e limites existentes.
- Salvamento server-side, autenticação, username, heroName, RLS e estrutura de saves.
- PT e EN com o mesmo significado; sem promessas de PvP disponível, NFT, token próprio, Steam ou versão instalável.

## 4. Ordem de prioridade

As prioridades abaixo indicam valor de revisão, não autorização de execução.

| ID | Prioridade | Melhoria | Esforço relativo | Evidência |
| --- | --- | --- | --- | --- |
| P01 | Alta | Corrigir promessas inconsistentes sobre Pedidos e Bolsas de Ouro | Pequeno | Portal ao vivo + código |
| P02 | Alta | Mostrar o jogo real antes dos blocos comerciais longos | Médio | Portal ao vivo + ordem de renderização |
| P03 | Alta | Revisar capturas promocionais e a história que elas contam | Médio | Assets inspecionados |
| G01 | Alta | Priorizar atividade e próximo passo no Acampamento mobile | Médio | Captura histórica + componente atual |
| G02 | Alta | Aproximar seleção e ação em Caça/Forja mobile | Médio | Capturas históricas + estrutura dos componentes |
| P04 | Média | Trocar slogans genéricos por exemplos do próprio jogo | Pequeno | Textos públicos e `content.mjs` |
| P05 | Média | Reduzir repetição de grades e ornamentos no portal | Médio | Portal ao vivo + CSS |
| P06 | Média | Separar claramente pré-temporada, Liga e Passe | Pequeno/médio | Portal ao vivo |
| G03 | Média | Uniformizar iconografia recorrente sem refazer os itens | Pequeno/médio | Assets + JSX |
| G04 | Média | Dar níveis de importância a bordas, títulos e estados | Médio | Capturas + tokens/componentes |
| G05 | Média | Reforçar a identidade de cada atividade com arte existente | Médio | Capturas + componentes |
| X01 | Média | Revisar legibilidade, toque e acessibilidade com conteúdo real | Médio | Tokens + capturas; validação atual pendente |
| P07 | Posterior | Dar voz humana ao desenvolvimento com atualizações reais | Pequeno por publicação | Estrutura editorial existente |

## 5. Portal: propostas concretas

### P01 — Corrigir informações antes de aumentar o apelo visual

**Pedidos.** A página Sistemas publicada e `systems`, item `orders`, em `portal/src/content.mjs` dizem que Pedidos pagam “Ouro e XP” / “Gold and XP”. Isso conflita com o resumo e com `src/game/deliveries.ts`: `applyDeliveryClaim` acrescenta ouro e shards/Éter; não acrescenta diretamente XP ao herói. Existe integração com o buff do evento Grande Entrega, que não equivale a dar XP direto por pedido.

Proposta de texto conservadora: “Entregue materiais, aguarde a viagem e recolha as recompensas do pedido.” Se o texto listar recompensas, conferir as ofertas atuais e explicar o evento separadamente. Não mudar o código de recompensa para fazer a frase antiga ficar verdadeira.

**Bolsas de Ouro.** A página Passe publicada e o bloco `add('pass', ...)` em `portal/src/pages.mjs` listam “Poder criar Bolsas de Ouro.” como vantagem do Passe. Em `src/game/goldPouch.ts`, `applyCreatePouch` permite criação sem exigir Passe; `paysPassFee` determina a taxa. `src/components/PouchPanel.tsx` também contempla quem não tem Passe.

Proposta: descrever **a taxa menor para criar Bolsas de Ouro**, sem insinuar exclusividade. Conferir os valores vigentes antes de publicá-los; o resumo registra 10% sem Passe e 5% com Passe. Essa taxa em ouro é diferente da taxa de 5% do Mercado em SOL: não juntar as duas.

**Disponibilidade.** Em Sistemas, o grupo Comércio recebe “Disponível” enquanto seu texto diz que Mercado de jogadores abre com a Temporada 1. O estado único do grupo mistura mercadores já acessíveis e uma abertura futura. Diferenciar os dois no texto ou no estado do sistema, sem liberar o Mercado por conta de uma alteração editorial.

**Aceite:** PT e EN corrigidos; nenhuma frase induz a buscar XP direto em Pedidos ou comprar Passe para um direito que já existe; nenhuma regra, preço ou flag alterada.

### P02 — Trazer a prova do produto para o começo

**Observado:** a Home começa com arena/cavaleiro e título grande. Em seguida vêm Temporada, Passe, destaques e Mercado. Só depois aparecem “Três passos” e “O jogo hoje”. `homeHero` já inclui os cartões de Temporada/Passe; não basta mover `homeShots` uma posição e supor que o problema foi resolvido.

Proposta de sequência para um estudo visual:

1. Abertura mais objetiva, com a arte atual e a identificação “RPG idle em pixel art · grátis no navegador”. CTA principal para o teste, secundário para ver o jogo.
2. Uma captura atual grande do Acampamento ou Caça, mostrando uma decisão real. Uma frase explica o que a pessoa está vendo.
3. O ciclo de jogo: escolher uma atividade, voltar para recolher, preparar o próximo avanço.
4. Temporada e Passe, mantendo visíveis elegibilidade, duração e aviso do reinício.
5. Mercado, com regras concretas e estado de abertura.
6. FAQ curta, atualização real se houver e CTA final.

Não é necessário eliminar a arte cinematográfica. Ela pode apresentar o mundo; a captura apresenta o produto. Evitar abrir com uma promessa visual de RPG de ação e só revelar o idle após várias telas.

**Arquivos:** `portal/src/pages.mjs` (`homeHero`, `homeMarket`, `homeSteps`, `homeShots`), `portal/src/content.mjs` (`home`), `portal/src/style.mjs`.

**Aceite:** em desktop, uma amostra legível do jogo aparece até a segunda viewport; em mobile, nenhuma sequência longa de ofertas separa a abertura da prova do produto. Verificar no build real, sem reduzir a captura até o texto virar textura.

### P03 — Usar capturas que representem uma sessão boa e plausível

**Observado:** `home.webp`, `inventory.webp` e `forge.webp` mostram inventário **48/26**. A Forja aparece bloqueada por inventário cheio; o Inventário está acima do limite e sem item selecionado. `hunt.webp` mostra sessão recém-iniciada, contagens zeradas e herói de aparência diferente do sprite das capturas mobile existentes.

Esses estados podem ser úteis em teste, mas não são a melhor apresentação do jogo. Não são prova de bug em produção, nem autorizam apagar itens ou aumentar capacidade.

Recomendação:

- Capturar um estado permitido pelo jogo, com capacidade disponível e atividade identificável.
- Home: atividade em andamento e próximo objetivo compreensível.
- Forja: receita possível, materiais legíveis e resultado claro; não simular uma compra/produção em conta real apenas para a foto.
- Inventário: selecionar um item representativo para mostrar detalhes, sem preencher tudo artificialmente.
- Caça: usar a composição vigente e um estado representativo, sem inventar quantidades.
- Manter personagem, aparência e progressão coerentes entre capturas da mesma sequência.
- Fazer PT e EN no mesmo build; registrar commit, viewport e estado de teste no processo de captura, não na UI pública.
- Não retocar números nem fabricar gameplay em imagens. Usar ambiente local de demonstração autorizado.

As quatro miniaturas secundárias da galeria são screenshots completos de 1440 × 900 reduzidos. Servem como visão geral, mas não permitem ler os sistemas. Considerar duas capturas maiores ou abertura acessível da imagem em tamanho maior, por clique e teclado.

**Arquivos:** `portal/public/img/shots/{pt,en}/`, `portal/src/content.mjs` (`shots`, `home.gallery`), `portal/src/pages.mjs` (`figure`), `portal/src/style.mjs` (`.h-gallery`).

**Aceite:** fotos correspondem ao build atual, não destacam bloqueios involuntários e podem ser examinadas no celular. Não apresentar screenshots como gameplay ao vivo.

### P04 — Escrever como quem conhece este jogo

Há frases intercambiáveis com muitos RPGs: “Quatro pilares da sua jornada”, “Evolua seu herói, desenvolva profissões...” e “Veja o que está chegando”. O problema é o acúmulo, não a existência isolada de uma delas.

Trocar parte dos conceitos abstratos por escolhas e nomes que só o Arena Idle tem. Exemplos para revisão, não textos finais aprovados:

| Trecho atual | Direção de reescrita |
| --- | --- |
| “Progressão idle com disputa de temporada.” | “Escolha a tarefa. Volte para preparar o próximo avanço.”; manter a Temporada em uma linha própria |
| “Quatro pilares da sua jornada.” | “Da coleta à próxima arma.”, acompanhado de uma receita existente e sua origem real |
| “Estratégia e construção de build.” | Mostrar uma escolha de equipamento/habilidade existente e sua consequência, sem inventar bônus |
| “Três passos. O resto o herói faz.” | Explicar que o jogador inicia uma tarefa por vez e que a Horta segue em paralelo; não sugerir todas as atividades simultâneas |
| “Negocie seus tesouros.” | Manter o título se desejado e tornar o apoio específico: o que é negociável, quando abre e o que acontece ao equipar |

Usar com moderação nomes como Clareira dos Pequenos Demônios, Pântano de Sangue e Montante de Aço. Uma cadeia real de material → receita → uso vale mais que cinco promessas de “progressão épica”. Validar receitas antes de escrever o exemplo.

Padronizar “Passe de Aventureiro” versus “Passe do Aventureiro” conforme o nome oficial escolhido no resumo/glossário. Preferir “teste aberto” a “playtest” quando isso tornar o PT mais natural. EN deve soar natural por conta própria, não ser uma tradução literal de slogans.

**Aceite:** cada bloco responde a uma pergunta do jogador; retirar palavras que não acrescentam informação; não adicionar números de rendimento, porcentagens de drop ou promessas novas.

### P05 — Variar a composição sem trocar a identidade aprovada

**Observado:** `.h-ring`, `.h-step-list`, `.h-pillar-list`, `.h-features` e `.h-bullets` repetem círculos com ícones, caixas e títulos destacados. A repetição de resumo dos sistemas, passos e pilares alonga a página sem sempre acrescentar informação.

Proposta:

- Deixar o ornamento forte na abertura e em um destaque de Temporada/Passe; usar divisórias e texto nos blocos explicativos.
- Unir seções que repetem a mesma ideia. Não substituir cada bloco removido por outro card.
- Mostrar o ciclo idle como sequência curta com itens reais já existentes, não como três cartões de marketing iguais.
- Manter dourado forte para a marca, ações prioritárias e destaques; reduzir brilho em elementos secundários antes de mexer na paleta.
- Reconciliar o wordmark serifado monumental da abertura com a marca pixel do cabeçalho e do jogo. Primeiro estudar proporção e coexistência; não criar outro logo sem aprovação.
- Não aplicar a regra das fontes do jogo indiscriminadamente a todo o texto longo do portal. Coerência de marca não exige que uma FAQ extensa use fonte pixel.

**Aceite:** a página tem começo, demonstração e explicação reconhecíveis; pelo menos uma repetição é eliminada; legibilidade e contraste permanecem bons. Não “resolver” com mais glow, glassmorphism, partículas, parallax ou gradientes animados.

### P06 — Fazer a Temporada parecer clara, não uma promoção ambígua

**Observado:** a página abre com “PRÉ-TEMPORADA” e “SEM PREMIAÇÃO OFICIAL”, mas logo abaixo mostra os fatos “60 dias” e “US$ 1.000+”, referentes à Liga futura. O texto explica a distinção; o leitor que apenas escaneia pode misturar os estados.

Proposta: dividir visualmente **Agora: pré-temporada** e **Quando a Liga abrir: Temporada 1**. No segundo grupo ficam duração, prêmio e regras da disputa. O aviso de reinício deve continuar fácil de encontrar antes de entrar no teste; não escondê-lo em tooltip ou apenas no FAQ para melhorar a estética.

Na página Passe, usar uma comparação pequena e factual: acúmulo de 6 h/10 h, bônus reais e acesso ao ranking, conforme fonte vigente. Não chamar tudo apenas de “conforto”, nem sugerir que o Passe é só cosmético. Explicitar a validade até a Temporada 1, sem renovação automática, e que a Temporada 2 exige novo Passe conforme a regra atual.

Manter USDC/Solana claros no contexto do pagamento e SOL no Mercado, sem colocar carteira como primeira mensagem para quem só quer conhecer o jogo. Não esconder essas condições de quem vai pagar.

**Arquivos:** `portal/src/content.mjs` (`seasonPage`, `home.season`, `home.pass`), `portal/src/pages.mjs` (`passHero`, `passOffer`, página de Temporada), `portal/src/style.mjs` (`.s-facts`, `.p-hero`).

**Aceite:** um leitor distingue teste sem prêmio de Liga com prêmio sem precisar conciliar dois blocos; não há alteração de prazo, meta, vantagens ou elegibilidade. Não revelar o número da meta interna de Passes.

### P07 — Mostrar manutenção humana por meio de mudanças reais

O portal já tem estrutura editorial em `portal/src/editorial.mjs` e `articles` em `content.mjs`; `pages.mjs` condiciona algumas áreas à quantidade de publicações. Aproveitar isso quando houver conteúdo real, sem criar notícias fictícias só para preencher a página.

Formato sugerido: data, alteração específica, uma captura antes/depois quando útil e o motivo da decisão. Por exemplo, uma alteração efetivamente entregue no inventário ou na preparação da Forja. Evitar posts repetidos de “estamos construindo uma experiência épica”.

Não inventar equipe, depoimentos, número de jogadores, avaliações, prêmios ou canais de comunidade. Se houver suporte oficial aprovado, torná-lo fácil de achar; o resumo já registra `arenaidlesupport@gmail.com`. Não publicar políticas jurídicas geradas como se tivessem sido aprovadas.

## 6. Jogo: propostas concretas

### G01 — Acampamento deve responder “o que faço agora?”

**Observado na captura mobile de 390 × 800:** o cabeçalho e o painel do herói com oito espaços de equipamento ocupam quase toda a primeira tela. “Atividade atual” só começa perto do final. No código atual, `DesktopHome.tsx` continua colocando `.hm-hero` e `.hm-slots` antes do bloco de atividade e do próximo passo.

Proposta mobile:

1. Resumo compacto do herói: aparência, nome, nível, CP e espaço disponível.
2. Atividade em andamento/estado de coleta e a sugestão já calculada por `nextStep`.
3. Atalhos relevantes.
4. Detalhes de equipamento e visão completa de progressão abaixo, ou detalhes recolhíveis de apresentação.

Não criar uma segunda lógica de “melhor próximo passo”. Reutilizar `src/game/nextStep.ts` e `src/components/nextStepText.ts`. Não ocultar aviso de mochila cheia nem transformar uma ação premium em gratuita.

Se os detalhes forem recolhíveis, não acrescentar persistência de jogo no navegador. Estado temporário de interface basta. O Personagem continua sendo o lugar para examinar todos os espaços com detalhe.

**Arquivos:** `src/components/DesktopHome.tsx`, `src/ui/shell.css` (`.hm-hero`, `.hm-slots`, regras mobile), componentes compartilhados quando necessário.

**Aceite proposto:** em 390 × 844, nome da atividade e próxima ação útil aparecem na primeira viewport em um estado comum; título/alertas longos não se sobrepõem. Nenhum equipamento fica inacessível. Comparar desktop antes/depois e evitar alteração ampla de layout por conveniência.

### G02 — Seleção e consequência devem ficar próximas no celular

**Observado nas capturas históricas:** Caça mostra a lista de quatro zonas ocupando quase toda a tela; Forja mostra várias linhas de abas/categorias e receitas antes de apresentar a decisão completa. Não foi medido o número atual de gestos necessário para iniciar/forjar; reproduzir primeiro.

Caça: ao selecionar uma zona, mostrar seus detalhes e a ação adjacentes à seleção ou em uma etapa curta com retorno claro. Manter todas as zonas e condições de desbloqueio acessíveis; não esconder bloqueios para parecer mais simples. Quando ativa, priorizar tempo acumulado, capacidade e coleta, com a cena pequena prevista no resumo.

Forja: aproximar receita escolhida, materiais faltantes, quantidade e botão de produção. Preservar nome completo do item, comparações e motivo de bloqueio. Lista compacta com detalhe separado pode funcionar melhor que vários cards extensos empilhados.

Um rodapé fixo só deve ser adotado se houver espaço reservado e teste com teclado virtual; não cobrir receita, botão de fechar ou avisos. Não usar `transform: scale()`/`zoom` para “caber”.

**Arquivos:** `HuntSelection.tsx`, `HuntRunning.tsx`, `HuntBattleView.tsx`, `ForgeModal.tsx`, `CraftQty.tsx`, `src/ui/hunt.css`, estilos de Forja em `src/ui/` e `src/App.css` após rastrear as regras efetivas.

**Aceite:** após selecionar, é evidente o que será iniciado/produzido e por que pode estar bloqueado; fechar a Caça não encerra a tarefa; animação não passa a gerar resultados; nenhum custo ou recompensa muda.

### G03 — Parar de misturar famílias de ícones nas áreas mais visíveis

**Confirmado em código:** `DesktopHome.tsx` usa PNG para Mineração e emoji para Lenhador/Horta nas linhas de profissões. `App.tsx` usa PNGs em várias entradas e emoji em Códice, Configurações e Convites. O resultado visual depende da plataforma e alguns símbolos parecem placeholders junto dos itens desenhados.

Primeiro mapear ícones existentes e conexões. Há `nav_mining.png`, `oak_wood.png`, `common_herb.png`, `camp_stash.png` e vários outros. Para a mesma profissão, usar a mesma referência visual no menu, no Acampamento e no cabeçalho quando fizer sentido.

Não substituir indiscriminadamente todos os ícones por uma biblioteca genérica de traços finos. Se realmente faltar um ícone, registrar a lacuna; produção de arte é um escopo separado. Preservar o fallback por emoji quando necessário para evitar elemento quebrado, sem tratá-lo como identidade final de uma tela central.

**Aceite:** não coexistem representações distintas da mesma atividade sem razão; tamanhos ópticos e alinhamento ficam consistentes; botões só de ícone mantêm nome acessível.

### G04 — Usar a hierarquia que a biblioteca de UI já permite

O jogo já possui `Panel`, `Button`, `ItemFrame`, `PageHeader`, `Dialog`, tokens e tamanhos de fonte. Não precisa de outro design system.

O excesso aparece quando painel, subpainel, título, aba ativa, seleção e ação repetem o mesmo destaque dourado. Nas capturas, vários retângulos competem com o item/decisão principal.

Proposta: manter a moldura característica dos painéis principais; usar os divisores roxos discretos já existentes nas subdivisões. A ação principal pode continuar dourada; navegação selecionada pode ser reconhecida por contorno/indicador, sem precisar sempre do mesmo preenchimento brilhante de uma ação final. Não mudar tudo globalmente sem comparar telas afetadas.

Separar visualmente quatro significados: selecionado, disponível, bloqueado e coletável. Raridade continua sendo propriedade do item, não substituto para estado de botão. Não alterar paleta de raridade ou sua semântica nesta revisão.

**Arquivos:** `src/components/ui/`, `src/ui/ui.css`, `src/ui/tokens.css`, estilos específicos. O modelo do mercado aprovado pelo dono continua sendo referência.

**Aceite:** a próxima ação é reconhecível sem ler todos os botões; avisos continuam visíveis; foco de teclado e estados de erro não dependem só de cor.

### G05 — Dar personalidade às atividades sem adicionar decoração excessiva

Acampamento, Forja e Caça têm funções diferentes, mas boa parte da identidade visual fica concentrada nos painéis. Usar o conteúdo que já existe para distinguir ambientes:

- Acampamento: herói e atividade atual, com uma pequena referência visual ao local; não um cenário gigante que empurre os controles.
- Forja: item selecionado e seus materiais como protagonistas; reaproveitar arte coerente existente antes de pensar em cenário novo.
- Caça: local reconhecível e cena compacta. A captura promocional inspecionada dá grande espaço ao combate; o resumo pede o contrário. Reproduzir a versão atual e conciliar a apresentação com essa direção, sem presumir que uma captura é o comportamento final.
- Inventário: grade funcional e detalhe útil. Não transformar cada item em card enorme para “valorizar a arte”.

Uma atmosfera própria pode vir de relações consistentes entre lugares, materiais e equipamento. Evitar brasões novos, partículas, narradores ou lore inventado por padrão. Uma descrição curta existente, como a da Adaga de Bronze na captura da Forja, transmite mais personalidade que slogans repetidos.

**Aceite:** a atividade é reconhecível sem depender apenas do título; a arte não cobre informação; o jogador continua entrando para decidir e saindo enquanto o herói trabalha.

### X01 — Legibilidade e acabamento fazem parte da identidade

`src/ui/tokens.css` define 13 px para corpo, 11 px para texto pequeno e alvo de toque de 44 px. A fonte e seus quatro tamanhos são uma escolha do projeto. Não resolver densidade reduzindo tudo, nem criar muitos tamanhos novos.

Revisar primeiro quais informações estão usando o menor tamanho. Nome de item, valor/custo e consequência de ação devem ser legíveis; metadados realmente secundários podem usar o menor token. Reduzir repetição e espaço ocupado antes de reduzir letra. Testar zoom e fontes carregadas de fato.

No login observado, o fundo funciona bem e o formulário é reconhecível. Preservá-lo. O aviso de reinício da pré-temporada é relevante: qualquer compactação futura deve manter sua leitura. Não refazer login/autenticação como efeito colateral desta análise.

Na navegação, `DesktopSidebar.tsx` contém `aria-label="Main navigation"` fixo. Quando essa área entrar no escopo de revisão, localizar também os nomes acessíveis para PT/EN. Isso é acabamento, não motivo para reescrever a navegação inteira.

Verificar foco, texto de bloqueio, fechamento por teclado, zoom, truncamento de nomes, tradução EN mais longa e redução de movimento. O projeto já possui tratamento de redução de movimento em `src/ui/base.css`; preservar e testar, não recriar outra preferência.

## 7. Plano de trabalho sugerido para quem continuar

### Etapa A — Conteúdo e apresentação do produto

Reproduzir P01, corrigir apenas textos comprovadamente inconsistentes, preparar a ordem proposta em P02 para revisão e planejar capturas representativas (P03). Ajustar PT e EN juntos. Isso entrega melhoria de confiança e identidade antes de uma reforma visual ampla.

### Etapa B — Uma tela piloto do jogo

Escolher o Acampamento mobile (G01), registrar o antes no build atual e estudar a hierarquia proposta. Aprovar essa tela visualmente antes de repetir a solução em Caça/Forja. Não aproveitar a tarefa para refatorar o engine ou alterar progressão.

### Etapa C — Coerência e acabamento

Aplicar iconografia consistente (G03), reduzir destaques redundantes (G04) e tratar seletor/detalhe mobile (G02) nas telas aprovadas. Só depois avaliar lacunas reais de arte. Cada rodada deve ser pequena o suficiente para o dono comparar antes/depois.

**Fora deste plano:** rebalanceamento, novas moedas, melhorias de monetização que mudem vantagens, mudanças de save, migrações, credenciais, publicação em Vercel e qualquer ação sobre contas reais.

## 8. Critérios de validação para uma futura implementação

Esses testes ainda não foram executados nesta análise.

- Mobile: 360 × 800, 375 × 812, 390 × 844, 412 × 915 e 430 × 932.
- Larguras intermediárias/desktop: 768, 1024, 1366 e 1920 px, com altura registrada em cada captura.
- PT e EN; conteúdo longo; herói novo, intermediário e avançado; atividade parada, ativa e com coleta; inventário normal e cheio.
- Conferir a ordem real das informações e a ação principal, não apenas ausência de overflow.
- Navegação por teclado, foco visível, alvos confortáveis e zoom; nenhuma informação importante depende exclusivamente de hover, cor ou animação.
- Comparar o login antes/depois para garantir preservação do background aprovado e do aviso de reinício.
- Portal deve explicar: o que é o jogo, o que o jogador faz ao voltar, o que está disponível agora e o que o Passe oferece. Não usar métricas falsas de conversão para declarar sucesso.
- Se houver teste com pessoas: pedir que descrevam o jogo após olhar a abertura, encontrem uma captura real e expliquem pré-temporada versus Liga. Registrar dificuldade observada; não inventar resultados.
- Nenhuma taxa de drop ou “/h” nova na UI. Chances de forja/Selo/garantia já permitidas permanecem conforme o projeto.
- Não acrescentar analytics ou coleta de dados só para medir estas alterações sem autorização.

Para futuras alterações de código, antes de commit seguir `AGENTS.md`: `npx tsc -b --noEmit`, `npm test`, `npx eslint .`, `npm run build`, `npm run check:bundle`, `npm run check:desktop`. No portal: `npm run build`, `npm run check`, `npm run check:season`, `npm run check:waitlist`, executados dentro de `portal/`. Conferir também `git diff --check`. Reavaliar instruções caso tenham mudado.

Não reportar esses comandos como aprovados só porque estão listados aqui. O trabalho desta rodada criou somente este documento e não fez commit, push, deploy ou mudança de ambiente.

## 9. Administrador — complemento solicitado pelo dono

### 9.1. O que foi possível verificar

Revisei `admin/src/App.tsx`, `styles.css`, componentes de tabelas/gráficos/painel lateral, hooks de carregamento, integração do backend e trechos das páginas Visão geral, Jogadores, Economia, Liga, Pagamentos e IA/Operações. Cruzei pontos com `RESUMO_DO_PROJETO.md`, `docs/ADMIN.md` e as migrations `0020_admin.sql` e `0025_pass_per_season.sql`.

**Não houve inspeção visual concluída das telas internas.** O endereço `https://arena-idle-admin-teste.vercel.app` levou ao login de proteção da Vercel. Iniciei o modo local já existente `VITE_ADMIN_DEMO=1`, com dados fictícios, mas o navegador integrado não alcançou `127.0.0.1:5226`. A alternativa de inspeção pelo navegador Windows foi interrompida pela ferramenta por não conseguir confirmar a URL com segurança. Não contornei essa proteção nem autentiquei outra conta.

O processo local de desenvolvimento foi encerrado. As variáveis usadas eram apenas do processo; nenhum arquivo `.env` foi modificado. A tentativa de fechar a aba integrada também foi bloqueada pela política da ferramenta na página de erro; seu fechamento não foi confirmado manualmente. Não foram consultados dados privados, acionadas pausas, reconhecidos relatórios, exportados jogadores ou executados comandos SQL.

As propostas abaixo têm **evidência no código**, não aprovação visual nem validação do banco real. Não confundir dados de demonstração com atividade real do jogo.

### 9.2. Direção: uma ferramenta do dono, não uma segunda landing page

O CSS do admin declara uma interface neutra propositalmente, com fonte de sistema, temas claro/escuro e tabelas. Essa escolha é adequada para leitura operacional. Não aplicar automaticamente o acabamento pixel/dourado do jogo a tabelas financeiras, e não gerar fundos fantasy para o painel.

Para reduzir a sensação de dashboard genérico, a melhoria principal é **organizar o painel em torno das decisões do dono**: o que precisa de atenção, qual informação está atualizada e como investigar cada caso. A identidade pode aparecer discretamente na marca e nos nomes corretos do jogo, sem prejudicar números ou densidade de informação.

Manter: separação do jogo/portal, dados de demonstração identificados, e-mails mascarados na lista, busca com debounce, exportação com neutralização de fórmulas, indicação real/teste e navegação por teclado já presente nas linhas da tabela.

### A01 — Alta: Passes da temporada e histórico precisam ser coisas distintas

**Evidência:** `0020_admin.sql` conta `owners_active` por `status = 'active'`, e o filtro de Passe em `admin_players` também usa esse estado. A migration `0025_pass_per_season.sql` registra que uma linha antiga pode permanecer `active` como histórico mesmo sem cobrir a temporada vigente. Ela introduz `valid_through_season` e adequa funções de elegibilidade, mas não redefine as três funções administrativas mencionadas no resumo. A pendência está explicitamente registrada em `RESUMO_DO_PROJETO.md`.

Consequência: “Passes ativos” e “Com Passe” podem ser interpretados como direito atual quando representam histórico de concessão/compra. Isso não deve ser corrigido apenas trocando uma cor de badge.

**Proposta futura, fora de uma tarefa só de CSS:** separar “válido nesta temporada” de “histórico de Passes”, fazendo a consulta respeitar as regras vigentes de vantagens e de ranking. Conferir também origem e rede de teste, que têm semânticas diferentes. Não filtrar receita histórica pela validade atual do Passe: dinheiro recebido e benefício vigente são medidas distintas.

**Arquivos:** futura migration versionada; `admin/src/pages/Overview.tsx`, `Players.tsx`, `lib/types.ts` e testes correspondentes. Não editar a migration aplicada só para reescrever o histórico.

**Aceite:** conta com somente Passe antigo deixa de parecer elegível na nova temporada; aquisição atual aparece corretamente; histórico e receita permanecem disponíveis. Testar concessão, indicação, compra real/teste, revogação e mudança de temporada em ambiente local antes de qualquer aplicação autorizada.

### A02 — Alta: abrir com pendências, não com um catálogo de números

**Evidência:** `Overview.tsx` coloca sucessivamente grupos de KPIs de jogadores, Passe, Mercado/Solana, itens/circulação e Liga, seguidos de seis gráficos. São dezenas de valores; o número de jogadores sinalizados fica depois de vários grupos comerciais. Em `styles.css`, abaixo de 420 px a grade de KPIs passa a uma coluna, ampliando o percurso vertical.

**Proposta:** primeiro um bloco curto “Precisa de atenção”, com links de leitura para pagamentos pendentes, alertas a investigar, pausas ativas e agregações atrasadas — apenas quando houver dados que sustentem esses estados. Depois, quatro a seis indicadores centrais escolhidos pelo dono; históricos detalhados nas páginas já existentes.

Não duplicar contagens parecidas sem explicar sua diferença: `refund_due_count` e a fila de exceções de pagamentos não devem ser presumidos como o mesmo conjunto. Não classificar crescimento de qualquer número como automaticamente “bom”.

**Aceite:** o dono consegue achar a principal pendência sem percorrer todos os gráficos; um clique abre o contexto filtrado; a ausência de dados nunca aparece como “tudo normal”. Não adicionar respostas fictícias de IA para preencher o resumo.

### A03 — Alta: mostrar a idade da informação, além da última requisição

**Evidência:** a Visão geral atualiza a cada 60 s e mostra a hora de carregamento por `loadedAt`. Ouro e progresso dependem de agregados/cache, com timestamps em `freshness`. “Online agora” significa salvamento nos últimos minutos, como o próprio subtítulo já informa. Parte das explicações de atualização fica no rodapé.

**Proposta:** manter três conceitos distintos: “consulta atualizada”, “dados agregados até” e “atividade recente estimada”. Mostrar a idade relevante junto do bloco, não apenas no fim da página. Se um cache estiver atrasado, usar aviso sóbrio com data/hora, sem dar aparência de medição em tempo real.

**Aceite:** atualizar a página não faz um agregado antigo parecer novo; o fuso usado nos períodos aparece de maneira consistente; não mudar o fuso do banco ou agendamentos como consequência do redesign.

### A04 — Alta: falha parcial precisa ter estado próprio

**Evidência:** `Overview.tsx` busca `overview()` e `series(30)` separadamente, mas renderiza aviso apenas para `ov.error`. Quando `series.data` é nulo, `Body` mostra um `Skeleton`; não verifica `series.error`. Por leitura do código, uma primeira falha das séries pode continuar parecendo carregamento, mesmo com os KPIs carregados. Não reproduzido em execução nesta rodada.

**Proposta:** distinguir carregando, vazio, falha e dado anterior mantido. Em erro de atualização, preservar o dado anterior com indicação de que está desatualizado. Dar tentativa de recarga específica para o bloco de gráficos, sem bloquear o painel todo.

**Arquivos:** `admin/src/pages/Overview.tsx`, `admin/src/hooks.ts` e componentes de estado, se necessário.

**Aceite:** falhar somente `series()` produz aviso útil; série legitimamente vazia não parece erro nem um gráfico de receita zero. Não transformar `null` de uma consulta incompleta em um resultado financeiro conhecido.

### A05 — Média: tabelas precisam favorecer investigação

**Evidência:** `Players.tsx` define doze colunas; Pagamentos combina valores, carteira, transação, motivos, estado e instruções SQL na mesma linha. A tabela de jogadores já tem filtros, paginação, ordenação e abertura por teclado: preservar essa base.

**Proposta:** deixar no resumo o que ajuda a identificar e priorizar: jogador, atividade recente, progresso principal, validade do Passe e alertas. Demais dados podem ficar no detalhe existente ou numa visualização expandida. Em telas estreitas, estudar prioridade de colunas e rolagem horizontal identificada; não reduzir a fonte até tudo caber.

Pagamentos deve permitir ler claramente valor/moeda, rede, origem e motivo antes de chegar às instruções de resolução. As ações atuais **copiam SQL**; não executam reembolso ou concessão. Preservar essa distinção nos rótulos e não transformar os botões em operações reais durante um ajuste de usabilidade.

**Aceite:** pesquisar → abrir caso → voltar mantém contexto; cabeçalhos e filtros são compreensíveis; não misturar SOL, USDC e ouro; não revelar e-mails completos por padrão nem exportá-los silenciosamente.

### A06 — Média: separar consulta, operação e sugestão da IA

**Evidência:** embora o resumo descreva o admin de forma geral como só leitura, o código de `AiOps.tsx` chama `setOpsFlag` e `ackReport`; `api.ts` aponta para `admin_set_ops_flag` e `admin_ack_report`. `docs/ADMIN.md` reconhece essas duas exceções. A interface tem confirmação e motivo para os interruptores. Isso é capacidade existente no código, não prova de disponibilidade no ambiente real.

**Proposta:** separar visualmente “Estado da operação”, “Incidentes” e “Relatórios da IA”. Nas pausas, usar descrição concreta do efeito e do estado desejado. “Marcar como lido” não deve parecer “resolver incidente”. Um alerta automatizado deve levar à evidência, não receber tratamento visual de sentença definitiva contra o jogador.

A navegação pode agrupar Monitoramento, Investigação e Operação, mantendo rotas e permissões. Não adicionar chat de IA, decisões automáticas ou comandos destrutivos para tornar o painel mais sofisticado.

**Aceite:** o dono identifica quais controles escrevem dados; confirmações existentes permanecem; sugestões não parecem ações já executadas; erro ou serviço não implantado é distinguível de ausência de incidentes.

### A07 — Média: marca e ambiente discretos, mas reconhecíveis

**Evidência:** `App.tsx` usa um “A” como `brand-mark`, com “Arena Idle” e “Painel do dono”. O modo de demonstração recebe sufixo próprio. Várias tabelas identificam real/teste, mas a casca não apresenta um rótulo explícito de ambiente conectado.

**Proposta:** reaproveitar um emblema oficial existente, se aprovado e legível no tamanho pequeno; não criar uma nova marca administrativa. Exibir ambiente obtido de configuração confiável, sem expor secrets. Manter a distinção por transação: ambiente do app não substitui o campo real/teste de um registro histórico.

O CSS neutro e as fontes de sistema podem continuar. A aparência autoral virá da organização dos casos e do vocabulário real do Arena Idle. Não replicar molduras, sprites animados ou fundo do login do jogo no admin.

**Aceite:** demonstração, teste e produção não se confundem; nenhum dado fictício é apresentado como métrica real; a identidade não compete com alertas e valores.

### A08 — Média: acessibilidade dos detalhes e gráficos

**Evidência:** `Drawer.tsx` move foco ao abrir, fecha com Escape e tenta devolver foco, mas não contém retenção de Tab dentro do diálogo nem uso de `inert` no fundo. Isso precisa de teste de teclado; não é um teste já executado. `Charts.tsx` fornece `<title>` nos pontos/barras dentro de SVG com `role="img"`, sem tabela de valores ou navegação explícita por ponto.

**Proposta:** testar e garantir foco contido no painel lateral aberto, retorno ao acionador e impossibilidade de acionar o conteúdo coberto. Nos gráficos, oferecer consulta textual/tabular dos mesmos valores e período; não depender só de hover, especialmente no celular.

**Aceite:** investigação completa por teclado; valores exatos disponíveis sem mouse; distinção entre séries além da cor; temas claro e escuro legíveis. Não é necessário trocar a implementação SVG por uma biblioteca pesada para isso.

### 9.3. Ordem sugerida e validação pendente

1. Reproduzir e tratar separadamente a semântica de Passe atual/histórico (A01) e os estados de falha parcial (A04).
2. Validar visualmente a Visão geral e priorização de pendências (A02/A03) no modo de demonstração já existente, sem credenciais reais.
3. Revisar tabela/detalhe de Jogadores e Pagamentos (A05/A08), depois organização de IA/Operações e identificação de ambiente (A06/A07).

Testar 390 px, 768 px e desktop 1366/1920 px; ambos os temas; carregando, vazio, falha, dados antigos, nomes longos e muitos resultados. Para o admin, não aplicar automaticamente exigência PT/EN do jogo: o código atual do painel é em português, e uma internacionalização seria escopo próprio.

Antes de futuro commit que altere `admin/`, rodar `npm run build` e `npm test` dentro de `admin/`, além dos portões gerais exigidos pelo `AGENTS.md`. Esta revisão não executou esses testes nem validou permissões/RLS no servidor. A lista é um plano de verificação, não um relatório de testes aprovados.

**Único arquivo de conteúdo alterado nesta continuação: `melhorias.md`. Nenhum código, asset, `.env`, migration, permissão ou dado de conta foi modificado.**
