# Um teste que só passava no dia seguinte à gravação

Data: 29/10/2026 (commit `9e25005`, junto da bandeira de conexão). Ensinou: [[Teste que depende da data de hoje]]

**O que acontecia.** `abilitiesIdentity.test.ts` começou a falhar sem que ninguém tivesse mexido nele. O save de referência (`abilitiesGolden.json`) carrega o dia em que foi gravado, então o teste só passava em 28/10.

**Conserto.** O relógio do teste foi preso àquela data. O arquivo golden **não foi tocado** e todos os números continuam sendo comparados exatamente.

**Por que isso importa mais que parece.** O golden é a única prova de que a aritmética do motor não mudou sozinha. Regravá-lo para "arrumar" o teste destruiria essa prova. O mesmo raciocínio apareceu em 29/10 na gota de pena na Clareira: a fixture em torno do golden passou a fixar a clareira como ela era quando o golden foi gravado, **sem** as entradas do fluxo de classe, em vez de regravar o golden ([[2026-10-29 — Materiais de classe não caíam onde a classe joga]]).

**Guarda.** O próprio `abilitiesIdentity.test.ts`, com o relógio preso (`vi.useFakeTimers({ toFake: ['Date'] })`). Ver [[Guardas que existem]].
