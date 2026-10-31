# O que faz diferença na Caça

Medido em 31/10/2026 com a Caça real (`scripts/tools/huntMatters.tool.ts`): herói de classe, tier 4, nível 42, sessões de 4 h, mudando uma coisa por vez. "Lugar" é o mais difícil que o herói comum vence em pelo menos 95% das lutas. Os números são desta medição, não do código; para atualizar, rode a ferramenta.

| O que muda | Vitórias por hora, no mesmo lugar | Até onde chega |
|---|---|---|
| Conjunto raro | +40% a +77% | 2 a 4 lugares acima |
| Conjunto épico | +56% a +105% | 7 a 22 acima |
| Conjunto lendário | +139% a +284% | 8 a 33 acima |
| Só a arma lendária | +44% a +63% | 4 a 5 acima |
| Só outra peça lendária | +10% a +26% | 1 a 6 acima |
| Refino +6 | +59% a +75% | 7 a 14 acima |
| Relíquia (medida no guerreiro) | 0% a +15% | Depende do efeito; a de ouro não muda vitórias |
| Sem nenhuma habilidade da arma e da armadura | -63% a -100% | 5 a 19 abaixo |
| Só a ordem das habilidades (Táticas) | No máximo 3% | Quase nada |
| Pontos de habilidade, caminho Guerreiro | +26% a +32% | 1 a 2 acima |
| Pontos de habilidade, caminho Caçador | +7% a +13%, e +14% a +31% de materiais | 0 a 1 acima |
| Pontos de habilidade, caminho Guardião | +2% a +4% | 1 a 3 acima |
| Bônus de classe (afinidade) | 0% a 4% | Pequeno |

## O que chama atenção

- **Materiais:** os 59 têm origem e uso, e todos os que a Caça promete caíram em 6 h.
- **XP tem teto de ritmo:** `xpPaceFractionForFight`. No tier 6 todos ficam perto de 22 mil XP por hora, comum ou lendário. A diferença lá é de materiais: guerreiro de 33 para 57 por hora.
- **Ouro da Caça é pequeno de propósito:** 3 a 16 por hora, pelo tempo de luta (`goldPerHour`). Equipamento não muda. O ouro vem de outras fontes.
- **Zona nova no raso paga menos XP que a anterior no fundo.** Guerreiro raro tier 4: 15 mil no fundo do Abismo, 7 mil no raso do Trono.
- **Queda brusca:** de 99% de vitórias para 0% em três lugares.
- **Agilidade é o pior atributo:** tudo em agilidade não vence nenhuma luta no lugar de referência, e +21 pontos dão de 0% a +3%, ou até perdem. Força dá de +4% a +9%.
- **Táticas:** as 4 habilidades cabem nas 4 vagas, então a única escolha é a ordem, e ela quase não muda nada porque todas saem assim que recarregam. Se fossem 3 vagas, deixar uma de fora seria escolha de verdade: guerreiro vai de 64 a 72 vitórias por hora conforme a que fica de fora. Mudar pede nova rodada de equilíbrio. A decisão é do dono.

Ver [[Classes e equipamento]] e [[Caça e masmorra]].
