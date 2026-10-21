# Instruções para agentes de código

Leia primeiro `RESUMO_DO_PROJETO.md`: ele descreve o jogo, o portal, o painel de administração, os ambientes e as regras do dono. Quando discordar de documentos antigos (como `GAME_STATE.md`), vale o resumo e o código.

Antes de cada commit, rode na raiz: `npx tsc -b --noEmit`, `npm test`, `npx eslint .`, `npm run build`, `npm run check:bundle`, `npm run check:desktop`. Para `portal/` e `admin/`, rode os comandos da seção 3 do resumo.
