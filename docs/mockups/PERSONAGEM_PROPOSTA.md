# Proposta visual — Personagem

Data: 21/10/2026. Referência para o dono e o Claude Code. Proposta para revisão; ainda não aprovada para implementação.

## Abrir a referência

[Mockup interativo de Personagem](personagem-proposta.html)

Caminho: `C:\Users\haduk\pixel-arena-tactics\docs\mockups\personagem-proposta.html`.

Abrir o HTML no navegador. A arte e as fontes estão incorporadas ao arquivo. Não exige login nem servidor. Clicar nos equipamentos e itens atualiza a ficha; busca, filtros e alternância Inventário/Baú funcionam com dados fictícios. Guardar/retirar move apenas itens da demonstração em memória. Não há acesso à conta ou ao Supabase.

## Problema observado

As duas capturas enviadas pelo dono são trechos da mesma página. Equipamentos grandes, Habilidades e personalização separam os slots equipados do Inventário. No fim da rolagem sobra uma grande região vazia na coluna direita. Nome/retrato/CP se repetem no cabeçalho global e no conteúdo; o nome grande quebra desnecessariamente.

## Estrutura proposta

```text
Cabeçalho e navegação atuais do jogo
Personagem
Retrato compacto | nome do herói | nível, CP e progresso de XP

Coluna principal                    Coluna de consulta
Equipamentos em slots compactos     Item selecionado
Conjunto e próximo bônus            Nome completo, raridade, bônus,
                                    durabilidade e ações existentes
Inventário | Baú
Busca e filtros atuais              Atributos em lista compacta
Grade de itens                      Distribuição de pontos

Habilidades (resumo expansível)
Títulos e aparência (expansível)
```

O objetivo é selecionar um item, ler sua ficha e conferir o equipamento com pouco deslocamento. O Inventário deve vir imediatamente depois de Equipamentos, sem Habilidades/Títulos no meio.

## Detalhes para a implementação futura

1. Manter roxo escuro, dourado, sprites existentes e fontes do projeto: Departure Mono no corpo e Press Start 2P nos títulos. O HTML contém cópias incorporadas das artes apenas para ser portátil; reutilizar os assets normais do jogo ao implementar.
2. Um resumo local do herói, com nome em uma linha quando houver espaço e quebra natural quando necessário. Não confundir `heroName` com username. Reaproveitar o cabeçalho global; o menu simplificado da proposta não substitui a navegação real.
3. Oito slots de equipamento. No desktop do mockup, quatro colunas, com três slots ocupados e cinco vazios. Slots ocupados têm ícone, categoria, melhoria e nome curto; o nome completo e os bônus aparecem na ficha. Na implementação, nomes longos precisam de acesso completo por toque e teclado, sem depender só de hover.
4. Slots vazios são menores e indicam a categoria. Não criar um botão habilitado sem ação. Não ocultar durabilidade baixa/quebra, bloqueios de slot, afinidades, gemas, conjunto, raridade ou outros estados existentes por causa da compactação.
5. Mostrar o conjunto uma única vez abaixo dos slots, com contagem e próximo bônus. Os números do mockup são exemplos das capturas; usar o cálculo real do jogo.
6. A ficha do item fica na direita no desktop. Pode acompanhar a rolagem se couber na altura disponível; em telas baixas, preferir rolagem normal para não prender ações fora da viewport. O mockup não implementa sticky.
7. No mockup, até 620 px, a mesma ficha é movida para dentro do bloco Inventário e abre abaixo da grade após selecionar um item, com Fechar detalhes. Isso demonstra uma alternativa mobile, não uma exigência de breakpoint para o produto. Não duplicar a lógica nem renderizar duas fichas divergentes.
8. Preservar as ações reais e suas regras: equipar/desequipar, guardar/retirar, consumir, vender, descartar, comparar e links para receitas/mercado quando existirem. Ações perigosas continuam com as confirmações atuais. A proposta simula apenas seleção e guardar/retirar; não é especificação de novas regras.
9. A capacidade aparece uma única vez por armazenamento. No mockup, nove pilhas não equipadas mais três equipamentos visíveis resultam em `9/32`; no jogo, usar sempre a função e a regra reais de ocupação, incluindo bônus do Passe e expansão. Não copiar a contagem simplificada do HTML para o save.
10. Preservar os filtros e a distinção visual entre equipado, raridade, quantidade e negociável. A grade da proposta mostra apenas itens presentes; decidir a representação dos espaços livres mantendo clara a capacidade. Não produzir dezenas de caixas vazias com destaque igual aos itens.
11. Atributos em lista de pares rótulo/valor, com CP como informação. Evitar botão dourado para um número sem ação. A distribuição manual de atributos continua disponível; o HTML só marca seu lugar, não desenha nem implementa todos os controles atuais.
12. Habilidades fica com resumo e acesso à página atual; Títulos e aparência mantém os desbloqueios e controles existentes. Não eliminar funcionalidades pelo fato de o mockup estar simplificado.

## Medidas de referência

São referências do desenho, não requisitos rígidos de CSS:

- Espaçamento entre áreas: aproximadamente 14–18 px; padding de seções: 12–16 px.
- Slots ocupados no desktop: em torno de 114 px de altura mínima; os vazios são menores. Nome longo pode aumentar a altura.
- Retrato local: 96 px no desktop e 76 px na versão estreita.
- Coluna de consulta: aproximadamente 230–290 px, respeitando o espaço do conteúdo.
- Ícones em slots: aproximadamente 40 px; alvos de toque a partir de 44 px.
- Corpo principal: 14 px, legendas: 11 px; respeitar os tokens tipográficos reais do projeto.

## Assets utilizados

`public/assets/spritesheets/hero_bronze_v2.png`, `public/assets/weapons/club.png`, `public/assets/gear_icons/armor_leather.png` e ícones existentes de elmo, couro, madeira, poção, flor, erva, garra, núcleo, minério e bolsa. A folha do herói é exibida por recorte CSS de um quadro; nenhuma folha original foi alterada. Imagens foram incorporadas com compressão sem perda; nenhuma arte foi gerada. As fontes existentes mantêm suas licenças originais.

## Verificação e limites

Verificado em DOM local: carregamento do script, seleção de item, filtros, busca sem diferença de acentos, troca Inventário/Baú, movimentação simulada, IDs únicos, ausência de marcadores de assets pendentes e ausência de chamadas ao backend. O HTML responde a larguras estreitas por CSS, mas não houve certificação visual de todos os breakpoints nem teste de dispositivo físico.

A tentativa de abrir a prévia servida em localhost no navegador integrado terminou em timeout de conexão. Portanto, a exportação está salva e os controles foram verificados em DOM, mas não se declara uma inspeção visual final do mockup renderizado no navegador. O dono/Claude deve conferir a referência ao abrir o HTML localmente.

O jogo ao vivo foi consultado para a revisão complementar em [REVISAO_INTERFACES_JOGO.md](../REVISAO_INTERFACES_JOGO.md). Nenhum componente do jogo foi editado nesta entrega. Não foram executados build, typecheck ou a suíte da aplicação, pois não houve alteração no app. Não houve commit, push ou deploy.

Para implementar depois da revisão do dono: conferir o código atual, aproveitar os componentes existentes, manter PT/EN e validar 360, 375, 390, 412, 430, 768, 1024, 1366 e 1920 px; seleção por teclado/toque, nomes longos, inventário cheio/vazio, item quebrado, slots sem item e todos os estados das ações. Seguir os checks de `AGENTS.md` e do resumo antes de commit.
