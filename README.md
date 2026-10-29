# Arena Idle

RPG idle em pixel art, jogado no navegador. O herói caça, minera, planta, forja e desce a masmorra enquanto você está fora; você volta, recolhe e decide o próximo passo.

Não existe classe escolhida: **você é o que veste**. O peso da armadura e a linha da arma formam guerreiro, arqueiro ou mago, e misturar peças sempre funciona.

🎮 **Jogar (ambiente de teste):** https://arena-idle-teste.vercel.app

## Começando

```bash
npm install
npm run dev
```

Node 22 ou mais novo.

## Antes de qualquer commit

```bash
npx tsc -b --noEmit && npm test && npx eslint . && npm run build && npm run check:bundle && npm run check:desktop
```

Os seis têm de passar. Rode-os numa cópia limpa de `HEAD`, não na árvore de trabalho — ver `docs/cerebro/ARMADILHAS.md`.

## Onde está o quê

| | |
|---|---|
| [`RESUMO_DO_PROJETO.md`](RESUMO_DO_PROJETO.md) | **Comece aqui.** O projeto inteiro: jogo, ambientes, estado atual, o que está pendente. |
| [`docs/cerebro/`](docs/cerebro/) | Decisões do dono, armadilhas e defeitos já pagos. A leitura que mais economiza tempo. |
| [`CLAUDE.md`](CLAUDE.md) · [`AGENTS.md`](AGENTS.md) | Como trabalhar no repositório e quais portões rodar. |
| [`docs/GDD.md`](docs/GDD.md) | O jogo como desenho. |
| [`docs/EQUIPAMENTOS.md`](docs/EQUIPAMENTOS.md) | As 158 peças, por classe (arquivo gerado). |

Feito com React 18, TypeScript e Vite, sobre Supabase (Postgres + Edge Functions), publicado na Vercel.
