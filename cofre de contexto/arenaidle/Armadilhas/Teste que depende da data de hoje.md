# Teste que depende da data de hoje

Ligações: [[2026-10-29 — Um teste que só passava no dia seguinte à gravação]] · [[Um teste de concorrência que pisca]] · [[Guardas que existem]]

**Sintoma.** Um teste que ninguém tocou amanhece vermelho.

**Causa.** Um save de referência (`abilitiesGolden.json`) guarda o dia em que foi gravado. O teste só passava no dia seguinte à gravação.

**Como evitar.** Prender o relógio do teste, nunca regravar o golden:

```ts
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
```

Veja `src/game/__tests__/abilitiesIdentity.test.ts`. **`abilitiesGolden.json` não se regrava** — é a prova de que o motor não mudou sozinho.

O mesmo cuidado já está em outro guarda: `honestPlayerAntifraud.test.ts` prende `Date` do mesmo jeito (`vi.useFakeTimers({ toFake: ['Date'] })`), porque o avaliador do servidor julga pelo relógio.
