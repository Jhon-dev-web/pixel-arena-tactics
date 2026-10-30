# A bandeira de "sem conexão" nunca voltava atrás

Data: 29/10/2026 (commit `9e25005`). Ensinou: [[Sem conexão com o servidor com o servidor inteiro no ar]] · [[Medir no lugar errado faz o conserto parecer inútil]] · Guarda: [[Guardas que existem]] · Sistema: [[Economia e materiais]]

**O que acontecia.** Quando uma chamada ao servidor de itens falhava, `tradeableStatus.ts` marcava `reachable = false`. O portão em `App.tsx` recusa a ação **lendo a bandeira, sem chamar o servidor** — então, uma vez caída, nada no caminho bloqueado voltava a tentar. O jogador ficava recusado até recarregar a página, mesmo com o servidor de volta.

A mensagem que ele lê promete "esta ação espera a conexão voltar". Não esperava.

**Conserto.** A bandeira guarda **quando** falhou e expira em 30 s — o mesmo intervalo que `useTradeableSync` já usa para tentar de novo. O que expira é só o direito de **tentar**: nada é criado nem gasto sem o servidor responder. `navigator.onLine === false` continua bloqueando na hora.

**Guarda.** `tradeableActions.test.ts`, bloco "the unreachable flag expires", com relógio falso: bloqueia aos 29,999 s, libera aos 30, a tentativa seguinte **chama** o servidor, uma nova falha reinicia o relógio, e offline bloqueia na hora.

**Importante.** Este **não** era o defeito que travava o dono naquele dia — aquilo era CORS (ver [[Sem conexão com o servidor com o servidor inteiro no ar]]). É um defeito real e separado, que atingiria qualquer jogador com uma falha de rede passageira. O commit diz isso na própria mensagem, de propósito, para o histórico não guardar a explicação errada.
