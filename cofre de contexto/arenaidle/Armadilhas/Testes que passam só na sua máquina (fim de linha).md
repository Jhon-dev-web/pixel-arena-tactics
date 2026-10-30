# Testes que passam só na sua máquina (fim de linha)

Ligações: [[Os portões verdes podem estar mentindo]] · [[2026-10-29 — Dois testes que só passavam com fim de linha LF]] · [[Guardas que existem]]

**Sintoma.** Um teste passa para você e falha para quem clonou o projeto agora — ou o contrário. No Windows, `git` configurado com `core.autocrlf=true` entrega os arquivos com CRLF; um arquivo que você editou com uma ferramenta pode ter ficado com LF.

**Causa.** Testes que leem arquivos e comparam com texto de várias linhas escrito com `\n`. Um `indexOf('\n}\n')` devolve `-1` num arquivo CRLF, e a asserção acaba comparando um pedaço errado — em 29/10/2026, a string de dois caracteres `'@m'`.

**O pior formato possível de erro:** verde no CI Linux, vermelho no primeiro clone de um colega. A máquina que pegaria o problema é justamente a que nunca roda.

**Como evitar.** Teste que lê arquivo normaliza na leitura:

```ts
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
```

Feito em `src/game/__tests__/marketWiring.test.ts` e `supabase/functions/_shared/__tests__/migration0007.test.ts`.
