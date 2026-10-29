# Revisão visual das interfaces do Arena Idle

Data: 21/10/2026. Referência para revisão do dono e leitura pelo Claude Code.

## Escopo e evidência

O dono pediu um mockup de Personagem e, durante a preparação, pediu para olhar as outras áreas. A revisão combinou as duas capturas de Personagem enviadas pelo dono com consulta visual ao jogo de teste autenticado em `https://arena-idle-teste.vercel.app/`. Li primeiro `RESUMO_DO_PROJETO.md`.

Foram vistas: Acampamento; escolha de zona e detalhes da Caça; Forja na aba Forjar; Ofícios na Fornalha; Inventário e detalhe de material negociável; Mineração em estado cheio; Lenhador bloqueado por outra atividade; Horta com canteiros prontos; Pedidos disponíveis; Habilidades e seu detalhe; Missões diárias/sequência; Mercado em Comprar; Passe ativo e trilha; seleção da Masmorra; Códice de equipamentos; Loja em Comprar; Convidar amigos; parte inicial de Configurações.

Não equivale a testar todas as abas ou todos os estados. As larguras efetivamente observadas variaram aproximadamente entre 622, 1280 e 1480 px, com altura próxima de 720 px. Não há validação visual de 360–430 px nesta revisão. Não entrei em combate, comprei, publiquei ofertas, vendi, resgatei, coletei, plantei, gastei pontos, troquei atividade ou alterei preferências. O dono fez o login e fechou o aviso de tutorial quando ele apareceu. A navegação normal pode atualizar preferências ou registros da aplicação; não houve edição direta de save/banco. As abas de revisão foram fechadas.

O ambiente estava recebendo trabalho de outras threads. Quem implementar deve reler o resumo, conferir `git status` e validar o código atual; não descartar trabalho de terceiros.

## Direção visual

Manter a identidade atual: pixel art, roxo profundo, dourado e fontes do jogo. Melhorar o caminho da decisão: atividade/estado atual, o que pode ser feito e qual o efeito da ação. Reduzir repetição e altura sem reduzir tudo, deixar fontes miúdas ou retirar informação necessária.

Não aplicar automaticamente a regra do administrador “sem gráficos” às barras de XP/tempo do jogo. Barras de progresso do herói, atividade e colheita têm uma função diferente e continuam úteis.

## Prioridades

| Área | Prioridade de design | Mudança principal sugerida |
| --- | --- | --- |
| Personagem | Alta | Equipamentos compactos, inventário logo abaixo e ficha do item ao lado. |
| Inventário/detalhe | Alta | Capacidade sem repetição; ações acessíveis antes da explicação longa. |
| Ofícios | Alta | Menos controles repetidos e destaque para receitas acessíveis. |
| Mineração/Lenhador | Alta | Estado e coleta em primeiro plano; bloqueios e desbloqueios mais compactos. |
| Passe ativo | Alta | Trilha acima da lista extensa de vantagens. |
| Habilidades | Média | Detalhe e ações mais próximos da seleção; requisitos claros. |
| Missões | Média | Sequência de login mais compacta e missões visíveis mais cedo. |
| Horta | Média | Canteiros mais curtos e menos repetição do estado pronto. |
| Caça | Média | Resumo de zona/profundidade/ocupação e ação mais próximos. |
| Acampamento | Média | Atividade e próximo passo antes do equipamento detalhado. |
| Mercado | Pontual | Escopo da ação Comprar/Vender mais claro e filtros legíveis. |
| Pedidos | Pontual | Preservar a comparação atual; melhorar leitura de requisitos. |
| Masmorra | Pontual | Preservar a hierarquia atual; compactar conteúdo secundário. |
| Códice | Pontual | Preservar a coleção e seu mistério; melhorar navegação por categoria. |
| Loja | Pontual | Preços com moeda explícita; melhor aproveitamento da grade. |
| Convites/Configurações | Pontual | Texto e agrupamento mais curtos; preservar ações sensíveis. |

Estas prioridades são julgamento de interface, não bugs confirmados nem autorização para implementar todas as telas.

## 1. Personagem e Inventário

Referência concreta: [mockup de Personagem](mockups/personagem-proposta.html) e [orientações de implementação](mockups/PERSONAGEM_PROPOSTA.md). Está em revisão, não foi aprovado ainda.

Nas capturas, a página separa Equipamentos e Inventário com outras seções e deixa a lateral vazia ao final. O mockup aproxima os dois, compacta slots vazios e ocupa a lateral com a ficha selecionada e atributos. Nome/retrato/CP deixam de ser repetidos em blocos grandes dentro da própria página.

No Inventário modal ao vivo, o detalhe de um minério negociável apresentava uma explicação extensa antes das ações. O painel lateral ganhou rolagem interna e os botões de venda/descarte ficaram parcialmente abaixo da área visível. Proposta: nome, quantidade, estado negociável e ações apropriadas primeiro; explicação extensa em “Sobre este material” ou equivalente. Separar visualmente “Vender no Mercado”, venda ao mercador por Ouro e descarte. Preservar mensagens de preço, orçamento do mercador, quantidade e confirmações.

Capacidade aparece no cabeçalho, na aba e novamente acima da grade. Usar uma única indicação por armazenamento. A grade pode mostrar itens existentes e um complemento discreto para espaço livre. Não concluir que a contagem está errada por contar ícones: equipamentos equipados podem estar visíveis sem ocupar a mesma capacidade das pilhas.

## 2. Ofícios

Na Fornalha, cada receita exibe seu próprio cabeçalho, estoque, quadro de requisitos, menos/quantidade/mais/Máx, tempo e botão Converter. Várias receitas bloqueadas por nível repetem toda essa estrutura. O leitor precisa separar o que já pode produzir do que só poderá usar no futuro.

Proposta a desenhar: lista compacta de receitas à esquerda e uma ficha de produção para a receita selecionada, seguindo o padrão já empregado pela Forja. No celular, lista seguida da receita selecionada ou detalhe expansível; sem rolagem de dois painéis estreitos. Uma alternativa menor é manter cards para receitas disponíveis e compactar as bloqueadas, com nível necessário e acesso a detalhes.

Requisitos devem distinguir claramente nível atual/necessário e saldo/custo. Preservar quantidade, máximo, tempo, matéria-prima, Ouro e o motivo real de bloqueio, inclusive ocupação do herói. Não alterar receitas nem produção em lote para obter esse layout.

## 3. Mineração e Lenhador

Na Mineração observada, a coluna direita mostra “EM ANDAMENTO” e também “Armazém Cheio!”, com coleta disponível. O título principal deveria refletir o estado real — por exemplo, “Armazém cheio” e “Pronto para coletar” quando o servidor já considera a produção parada. Confirmar o estado no código antes de trocar o rótulo; isso não pede mudança do temporizador ou das recompensas.

O tempo desde o início e o tempo efetivamente armazenado precisam ser coisas claras. Não dar a entender que as 29 h decorridas geraram 29 h de recursos quando o limite era 10 h.

Os tiers bloqueados ocupam cards grandes e repetem o nível no selo e na frase; abaixo, “Próximos desbloqueios” repete esses marcos. Mostrar o próximo desbloqueio em destaque e permitir expandir os demais. Manter o benefício futuro e a curiosidade sem deixá-los competir com a coleta atual.

No Lenhador, a mensagem de ocupação apareceu dentro do primeiro card. Mostrar a atividade que ocupa o herói em um aviso claro no início da seleção. O usuário precisa saber por que não pode começar; não criar troca automática de atividade nem cancelar a atual como efeito de navegação.

## 4. Passe de Aventureiro

Para a conta com Passe ativo observada, a sequência era: cabeçalho, painel grande de XP, abas, uma lista de onze vantagens e só depois a trilha. A tarefa recorrente é consultar progresso e recompensas. Colocar a trilha logo após o resumo de nível/XP; vantagens ficam consultáveis em seção própria, com estado ativo e validade sempre acessíveis.

Isso é específico do Passe já ativo. A apresentação de compra para quem ainda não possui Passe precisa manter benefícios, preço, validade e condições visíveis; esse fluxo de pagamento não foi testado.

Na trilha, alinhar as duas linhas de recompensas e identificar Grátis/Premium sem depender apenas de uma legenda distante. Manter nomes e quantidades legíveis e o atalho “Ir para o meu nível”. Preservar todos os níveis e recompensas. Não alterar economia, vantagem premium ou custo do Passe.

## 5. Habilidades

As três árvores em paralelo e seus ícones têm identidade e ajudam a leitura por ramo. Eu as manteria. O detalhe da seleção e Aplicar/Desfazer/Conjuntos aparecem depois da altura das árvores; na viewport observada exigiam rolagem.

Proposta: reduzir espaços entre fileiras onde houver folga real, aproximar o detalhe do nó escolhido e manter saldo/alterações pendentes perto de Aplicar. No desktop largo, testar ficha lateral; em largura intermediária, pode ser melhor uma ficha abaixo, sem encolher as três árvores. No celular, ramo por aba é uma alternativa que exige mockup próprio antes de implementar.

“req. 2/5/10” precisa explicar o que o requisito significa, conforme a regra real. Não adivinhar nível versus pontos gastos. Preservar visualmente nó disponível, escolhido, bloqueado e limite de postos; não inventar conexões ou pré-requisitos.

Alguns ícones apareceram vazios na primeira captura e ficaram visíveis ao terminar o carregamento. Isso não confirmou assets quebrados. Se o carregamento incomodar, usar estado de carregamento estável sem diagnosticar falha de arquivo a partir da primeira pintura.

## 6. Missões

Na aba Diárias, o painel da sequência de login toma grande parte da primeira viewport: sete cards, recompensa atual, aviso do escudo, botão de resgate e explicação adicional. As missões começam embaixo.

Compactar a sequência numa faixa com dia atual, recompensa e ação, mantendo acesso aos sete dias. Consolidar explicações repetidas do Escudo sem ocultar seu efeito ou estado. As recompensas nos cards da sequência parecem pequenas em relação ao espaço do card; melhorar a proporção da arte e dos valores, não só diminuir o container.

Nas missões, manter objetivo, progresso e recompensa no mesmo bloco. Verificar depois casos concluído, resgatável e resgatado. Nenhuma recompensa foi coletada nesta revisão.

## 7. Horta

A ação Colher todos é clara e deve ser mantida. Em cada canteiro pronto aparecem selo “Pronto”, barra cheia, frase “Pronto para colher” e botão Colher. Reduzir a repetição para economizar altura, mantendo planta, quantidade, estado e ação.

Os canteiros bloqueados podem ser mais curtos e continuar mostrando o nível necessário. O próximo desbloqueio é útil; a lista completa de quinze marcos pode ficar expansível. Preservar a identidade visual de jardim e a coexistência com as outras atividades. Não unificar canteiros de forma a esconder qual planta está em cada um.

## 8. Caça

Foram vistas lista de zonas e a Clareira selecionada, no Raso, com o herói ocupado em Mineração. A tela reúne monstro, CP, profundidade, nível da zona, teste, capacidade, materiais e peças únicas. Boa informação, mas várias caixas e a rolagem distanciam a escolha da ação.

Proposta: resumo compacto de zona e CP, seleção de profundidade, progresso do nível e bloco da ação com motivo do bloqueio. Aproximar aviso de ocupação da escolha; materiais e peças únicas continuam acessíveis abaixo. A perda de excedente por inventário cheio deve permanecer clara junto da ação.

Não adicionar porcentagem de drop, estimativa por hora ou simulador de rendimento. Não modificar chances, velocidade, teste, capacidade ou XP. Não foi iniciada uma caçada para validar animação ou combate.

## 9. Acampamento

Na viewport estreita vista inicialmente, um retrato/resumo grande vem antes da atividade. No desktop observado depois, equipamentos completos também ocupam espaço antes da atividade atual. Para o retorno frequente, elevar Atividade atual, Resgatar e Próximo passo. O herói pode ficar em resumo menor, com equipamento completo acessível por expansão ou por Personagem.

Manter a indicação do motivo da parada e a separação entre a atividade do herói e a Horta. O aviso de retorno já diferencia “armazém cheio, o herói parou”; essa clareza pode ser reaproveitada no restante da interface.

## 10. Áreas que pedem ajustes menores

### Forja

Manter a estrutura lista de receitas + detalhe. É uma boa referência interna para Ofícios. Requisitos e prévia de atributos ajudam a decidir. Melhorar quebra de nomes, legibilidade das categorias quando ficam em duas linhas e repetição de descrições longas dentro da grade. Bônus completos ficam na ficha. Apenas Forjar foi consultado; Melhorar/Reparo/Gemas precisam de avaliação própria.

### Pedidos

Quatro pedidos lado a lado permitiram comparar duração, custo e recompensa na viewport observada. Não redesenhar por obrigação. Melhorar os rótulos de saldo/necessário e manter materiais insuficientes reconhecíveis por texto além da cor. Em larguras menores, reavaliar quantidade de colunas sem converter os cards em blocos enormes. Trocar/Aceitar não foram acionados.

### Mercado

A base atual de busca, filtros, card e ficha está coerente com o jogo. No estado Comprar, o formulário Criar oferta ocupa permanentemente a direita. Avaliar se essa ação fica mais clara na aba Vender, usando a lateral em Comprar para detalhes do anúncio selecionado. É uma proposta de organização, não uma falha confirmada nem uma mudança já aprovada.

Manter rede de teste/produção, moeda, preço unitário, lote inteiro, taxa e valor líquido. Filtros de categoria muito estreitos não devem esconder a seleção sem forma de consultá-la. A revisão não conectou carteira, assinou, reservou ou efetuou transação.

### Seleção da Masmorra

Hierarquia clara: andar/CP/checkpoint e Entrar na Batalha, com progresso à direita. Preservar essa base. Profundezas bloqueadas e configuração de poção podem ter apresentação mais compacta ou expansível. Não remover controle de poção nem alterar a regra. O combate não foi iniciado.

### Códice

Preservar coleção, categorias e silhuetas de itens não descobertos. Não tratar silhuetas escuras como falha de PNG. Navegação direta entre categorias e ficha selecionada perto do item podem reduzir a rolagem; manter nomes/revelações conforme a descoberta real. Não alterar a regra de descoberta para preencher a tela.

### Loja

Os cards de consumíveis são compreensíveis. Melhorar ocupação da grade sem esticar artificialmente cards para preencher a largura; moeda do preço deve ser clara por texto/acessibilidade, especialmente ao alternar Ouro/Éter. Preservar o motivo de compra desabilitada. Vender/Atacado/Bolsas não foram testados.

### Convidar amigos

O link e o botão Copiar estão bem expostos. Reduzir a repetição da condição “amigo chega ao nível 10”, mantendo distinta a condição de convites ativos da condição de compras do Passe. Títulos e moldura podem usar seus assets existentes quando disponíveis e carregados. Nenhum link foi compartilhado.

### Configurações

Os grupos Conta, Passe e Jogo são reconhecíveis. Não incluir ação destrutiva com o mesmo peso das preferências comuns; manter as confirmações. Reduzir altura de controles extensos apenas onde necessário. A revisão se limitou à área superior e à leitura dos grupos via acessibilidade; não avaliou todos os detalhes da rolagem nem alterou controles.

## Continuação pelo Claude

1. Mostrar o mockup de Personagem ao dono e colher seu retorno antes de implementá-lo. Esta referência não aprova automaticamente as outras propostas.
2. Começar pelas tarefas com ganho de uso recorrente: equipamentos/inventário, produção, coleta, trilha ativa. Usar mudanças locais em componentes; evitar overrides globais para todas as telas.
3. Reaproveitar as fontes, cores, assets, componentes e traduções existentes. Não gerar arte substituta nem transformar tudo em cards idênticos.
4. Preservar lógica, limites, materiais, recompensas, pagamentos, confirmação de ações, progressão, save e acessibilidade. Não substituir dados reais por exemplos do mockup.
5. Validar 360, 375, 390, 412, 430, 768, 1024, 1366 e 1920 px, incluindo carregamento e nomes longos. Não declarar aprovação de todos esses tamanhos com base nesta revisão.
6. Rodar os checks do projeto na eventual implementação. Esta entrega contém documentos e mockup, não alterações de aplicação; não executou a suíte/build do jogo, não fez commit, push ou deploy.
