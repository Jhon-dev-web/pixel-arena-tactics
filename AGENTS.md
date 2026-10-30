# Instruções para agentes de código

Leia primeiro `RESUMO_DO_PROJETO.md`: ele descreve o jogo, o portal, o painel de administração, os ambientes e as regras do dono. Depois abra o cofre de contexto em `cofre de contexto/arenaidle/` (vault do Obsidian; comece por `Comece aqui.md`), que guarda as decisões do dono, as armadilhas, os defeitos que já custaram caro e o que cada guarda de teste protege. Quando um documento discordar do resumo, vale o código primeiro e o resumo depois; a seção 12 do resumo lista os documentos que ainda enganam e em quê.

`CLAUDE.md` tem as regras de **como trabalhar**: quem é diretor e quem é executor, não parar enquanto houver tarefa, e o que fazer quando a lista acabar.

Antes de cada commit, rode na raiz: `npx tsc -b --noEmit`, `npm test`, `npx eslint .`, `npm run build`, `npm run check:bundle`, `npm run check:desktop`. Para `portal/` e `admin/`, rode os comandos da seção 3 do resumo.
