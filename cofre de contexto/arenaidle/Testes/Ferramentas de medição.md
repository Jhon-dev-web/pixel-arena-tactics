# Ferramentas de medição

Voltar: [[Comece aqui]] · Ligações: [[Os seis portões]] · [[Guardas que existem]] · [[Classes e equipamento]] · [[Economia e materiais]] · [[Antifraude e temporada]]

**Medem e imprimem; não afirmam nada e não protegem contra regressão.** Ficam fora de `npm test`. A configuração é `vitest.sim.config.ts`, que inclui `scripts/sim/**/*.sim.ts`, `scripts/sim/**/*.gen.ts` e `scripts/tools/**/*.tool.ts` (as `.tool.ts` entraram na configuração em `1359a1f`: sem isso uma ferramenta de medição era uma que ninguém podia rodar).

Forma geral, na raiz:

```
npx vitest run --config vitest.sim.config.ts <nome> --silent=false --reporter=default
```

(`--silent=false --reporter=default` é o que faz o relatório aparecer.) Várias têm atalho em `package.json` (`npm run sim`, `sim:cp`, `sim:long`, `sim:flow`...).

## As cinco ferramentas de 29/10 (`scripts/tools/`)

| Ferramenta | Pergunta que responde | Resposta que já deu |
|---|---|---|
| `classAxesWide.tool.ts` | A tabela de eixos vale para as seis armas? | Não valia: a besta liderava a Caça. Imprime também o ruído (`AXES_NOISE=k` re-mede cada par com k conjuntos de sementes) e o mapa do teto de crítico. **Rode antes de dar a tabela por cumprida** ([[A tabela de eixos julga classes, não armas gêmeas]]) |
| `carryDodgeSpeed.tool.ts` | O transbordo ou a Arrancada crescem com a velocidade de ataque? | Não; a vantagem da besta era a estatística da arma. Os controles são o que a tornam legível: onde um efeito não existe, todo cenário move a build em exatamente 0,0% |
| `classDoor.tool.ts` | Quando cada classe abre a sua porta de material? Env: `SIM_DAYS` (30), `SIM_SEEDS` (1) | Guerreiro tier 3 no dia 10, arqueiro no 11, mago nunca em 30 dias; o nível da Horta não é o gargalo |
| `fiberShare.tool.ts` | Que fatia da fibra do mago vem da Caça? Env: `SIM_DAYS`, `SIM_SEEDS` (3), `SIM_PASS=1` | Medida para calibrar o fio de linho e algodão ([[2026-10-29 — Materiais de classe não caíam onde a classe joga]]) |
| `gardenFertilizer.tool.ts` | Quanto vale o Adubo em cada padrão de visita? | +0% para quem volta a cada 12 ou 24 h antes do bônus ([[2026-10-29 — O Adubo não pagava nada a quem volta tarde]]) |

## Simulações e diagnósticos relevantes (`scripts/sim/`)

- `classAxes.ts` e `classHero.ts`: **a régua**. Montam o herói e medem Caça, chefe e andar; o guarda e a ferramenta larga usam as mesmas.
- `classBalance.sim.ts`: as três classes nos três eixos. `gearOnlyLead.sim.ts`: o que só o equipamento dá, tier a tier. `axisSearch.sim.ts`: busca aleatória nas alavancas das classes (ver [[Uma busca numérica conserta pelo caminho mais curto]]; `AXIS_N=60`).
- `variantDiag.sim.ts` (por que besta, cetro e machado não eram segunda arma viável) e `regenDiag.sim.ts` (a regeneração vale algo? só num eixo).
- `cdScale.sim.ts`: a medição que justificou `abilityCdScale`, mantida como ferramenta.
- `classPlayer.sim.ts`: joga as três classes e cada arma fixa e **falha** se algum herói termina sem `classActive` (é a exceção: ela afirma). 21 dias por padrão (`SIM_DAYS`, `SIM_SEEDS`).
- `classAntifraud.sim.ts`: as três classes contra os limites do servidor (`LONG_OUT` guarda as corridas de `npm run sim:long`).
- `progression.sim.ts` (`npm run sim`): progressão de 14 dias de um jogador novo grátis. `longHaul.sim.ts` com `scripts/sim/long.mjs` (`npm run sim:long`): corridas longas, sementes em vários processos. `LONG_TABLES=1` fixa tudo que uma tabela do servidor depende (sementes, 60 dias, os seis cenários honestos) e grava um manifesto com o código em que rodou.
- `materialFlow.sim.ts` (`npm run sim:flow`), `materialSupply.sim.ts` (`npm run sim:materials`, **depois** de `sim:long`; imprime `HONEST_PEAK_DAY_UNITS` para colar em `rates.ts`), `professions.sim.ts`, `itemAudit.sim.ts` (`sim:items`), `subLevelReach.sim.ts` (`sim:sublevels`), `depthReach.sim.ts` (`sim:depths`).
- `seasonBounds.sim.ts` (`npm run season:bounds`): imprime cada limite do antifraude ao lado do valor recalculado dos tunables.

## Geradores (`*.gen.ts`): escrevem arquivo

| Gerador | Escreve | Guarda se esquecer |
|---|---|---|
| `cpTable.gen.ts` (`npm run sim:cp`) | `src/game/recommendedCp.ts` | o comentário do gerador cita `recommendedCp.test.ts`, que **não existe** no repositório; os testes que leem `recommendedCp` são `balance.test.ts`, `dungeon.test.ts`, `depths.test.ts`, `round17.test.ts` e `zoneLevelGates.test.ts`. Não vi guarda que acenda se a tabela ficar velha |
| `seasonTables.gen.ts` (`npm run season:tables`) | `supabase/functions/_shared/progress/tables.ts` | `seasonProgress.test.ts` |
| `itemTables.gen.ts` (`npm run item:tables`) | `supabase/functions/_shared/items/tables.ts` | `itemTables.test.ts` |
| `materialTables.gen.ts` (`npm run material:tables`) | `supabase/functions/_shared/materials/tables.ts` | `materialServer.test.ts` |
| `weightBudget.gen.ts` | os blocos de conversão de `src/game/gear.ts` | `itemBalance.test.ts` (quebra a paridade de CP se esquecer; foi o caso da besta) |
| `equipamentos.gen.ts` (`npx vitest run --config vitest.sim.config.ts equipamentos`) | `docs/EQUIPAMENTOS.md` | lança se as quatro seções não somarem `GEAR.length` ou se faltar nome em `pt.json` |
| `recipeTune.gen.ts` (`npm run sim:recipes`) | só imprime JSON; os números são colados à mão em `gear.ts` | |
| `smokeSaves.gen.ts` | `smoke-out/saves.json` (fora do git) | |

**Depois de gerar tabela para o servidor, republique a função** ([[A função publicada não é a função do repositório]]).

## Teste de fumaça de interface

`npm run smoke:ui` (`scripts/smoke/ui.mjs`): carrega três saves preparados (herói novo, meio de jogo, fim de jogo) em 390×800, 1280×800 e 1920×1080, abre cada tela do menu e falha em: erro de console, chave de tradução crua na tela, NaN ou undefined no texto, estouro horizontal, botão sem nome acessível. Fala com o Chrome ou Edge já instalado pelo protocolo DevTools (nada baixa); sem navegador, avisa e sai com 0. **Feche as abas e o servidor depois**: a música do jogo continua tocando para o dono ([[Armadilhas herdadas de direções anteriores]]).

## Lições de método que as ferramentas ensinaram

- **Meça o ruído antes de escolher a margem** ([[Regra demais para alavanca de menos]]).
- **Meça todas as armas**, não uma por classe ([[Um guarda que mede uma amostra pode passar com a regra quebrada fora dela]]).
- **Controles**: uma medição que não tem um caso em que o efeito não existe não prova que o efeito mexe.
- **Todo relatório que imprime zero merece desconfiança**: foi o caso do Adubo, em que o ensaio entupiu a mochila e o relatório mostrou zeros; nada em `src/` estava errado ([[2026-10-29 — O simulador só jogava o guerreiro]]).
