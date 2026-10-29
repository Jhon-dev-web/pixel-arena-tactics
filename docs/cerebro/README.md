# Cérebro: o que aprendemos trabalhando neste projeto

Esta pasta guarda o que **não** está em nenhum outro documento: armadilhas que já custaram horas, defeitos que já aconteceram e o guarda que hoje impede cada um de voltar, e as decisões do dono com o motivo de cada uma.

Serve para quem chega depois — outra sessão, outra pessoa, outra IA — não repetir o que já foi pago uma vez.

## A regra desta pasta

**Nada aqui copia o que vive em outro lugar.** O que o código, as tabelas geradas ou os outros documentos já dizem, esta pasta apenas aponta.

O motivo é o defeito mais comum deste repositório: número ou explicação duplicada fora do lugar onde ela nasce **envelhece em silêncio**. Já aconteceu com o cartão de um evento que prometia +8% enquanto o jogo pagava até +15%, com um comentário que descrevia um portão como proteção contra morte quando ele era ritmo de progressão, e com três rótulos de tela que diziam "exige CP" depois que o CP deixou de exigir qualquer coisa.

Então, ao escrever aqui:

- **duplicou um número? apague e aponte.** Se o número precisa aparecer para o jogador, ele precisa de um teste que o prenda à configuração (veja `src/game/__tests__/eventCards.test.ts`);
- **escreva a data** em que a coisa foi aprendida, e o que foi **medido**, não o que se supôs;
- **quando algo mudar, corrija aqui também.** Um cérebro desatualizado é pior que nenhum, porque dá confiança falsa.

## O que tem aqui

| Arquivo | Para quê |
|---|---|
| [`ARMADILHAS.md`](ARMADILHAS.md) | Coisas que parecem uma e são outra. Cada uma com o sintoma, a causa e o comando que decide. |
| [`BUGS.md`](BUGS.md) | Defeitos que já aconteceram: causa, por que ninguém viu, e o guarda que hoje acende. |
| [`DECISOES_DO_DONO.md`](DECISOES_DO_DONO.md) | O que o dono decidiu, quando, e por quê. Não mude nenhuma sem perguntar a ele. |

## Onde está o resto

Isto aqui é a camada de aprendizado. O que descreve o jogo e o processo vive nos documentos de sempre:

- [`RESUMO_DO_PROJETO.md`](../../RESUMO_DO_PROJETO.md) — o projeto inteiro, os ambientes, as chaves, os comandos
- [`CLAUDE.md`](../../CLAUDE.md) — como diretor e executor trabalham, e o que pode ser feito sem perguntar
- [`AGENTS.md`](../../AGENTS.md) — os portões obrigatórios antes de qualquer commit
- [`GDD.md`](../GDD.md) — o jogo como desenho
- [`CLASSES_E_EQUIPAMENTOS.md`](../CLASSES_E_EQUIPAMENTOS.md) — a reforma de classes, com as medições
- [`WEB_LAUNCH.md`](../WEB_LAUNCH.md) — publicar, incluindo o passo do alias (seção 5.6)
