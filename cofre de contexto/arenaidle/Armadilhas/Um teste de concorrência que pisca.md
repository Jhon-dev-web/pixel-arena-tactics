# Um teste de concorrência que pisca

Ligações: [[Teste que depende da data de hoje]] · [[Guardas que existem]] · [[Antifraude e temporada]]

**Sintoma.** `supabase/functions/_shared/__tests__/progress.test.ts`, no caso "two parallel calls store exactly one snapshot", falhou uma vez e passou ao rodar de novo, sozinho (79 testes) e na suíte inteira. Observado em 29/10/2026.

**O que fazer.** Não é motivo para parar o trabalho nem para mexer no teste. Mas **não o ignore em silêncio**: se acender de novo, é teste que depende de tempo e precisa ser prendido a um relógio, como foi feito em `abilitiesIdentity.test.ts`. Anote aqui a data da próxima vez, para a terceira ocorrência virar tarefa.

Ocorrências: 29/10/2026.

O que o teste protege: de duas chamadas paralelas, exatamente uma ganha o espaço de gravação (o limite é uma instrução SQL só, `progress_claim_slot`, segundo `docs/SEASON_RANKING.md` seção 2). Se ele piscar por causa de tempo, a regra do servidor continua valendo; o que se perde é a confiança no sinal.
