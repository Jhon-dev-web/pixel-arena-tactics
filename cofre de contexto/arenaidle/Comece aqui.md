# Comece aqui

**Arena Idle** é um RPG idle em pixel art, jogado só no navegador (o dono joga no celular). O herói caça, minera, planta, forja e desce a masmorra sozinho; o jogador volta, recolhe e decide o próximo passo. Não existe classe escolhida: o herói é o que veste.

**Este cofre é o segundo cérebro do projeto.** Guarda o que **não** está em nenhum outro documento: o contexto, as decisões do dono e o motivo, as armadilhas que já custaram horas, os defeitos que já aconteceram (e o guarda que hoje impede cada um de voltar), e a lista do que cada teste protege.

Serve para quem chega depois: outra sessão, outra pessoa, outra IA. Não repetir o que já foi pago uma vez.

**Quem for mexer no código: leia [[Decisões do dono]], [[Os seis portões]] e as armadilhas antes de qualquer mudança.** Várias decisões do dono parecem erro para quem só olha o código.

---

## Projeto

- [[O jogo em uma página]]
- [[Decisões do dono]] — o que ele decidiu, quando, por quê. Não se muda sem perguntar.
- [[O que está em aberto]] — o que é dele, o que é trabalho já permitido, e as perguntas sem resposta.

## Sistemas

- [[Classes e equipamento]]
- [[Caça e masmorra]]
- [[Economia e materiais]]
- [[Antifraude e temporada]]

## Testes

- [[Os seis portões]] — o que rodar antes de qualquer commit, e onde rodar.
- [[Guardas que existem]] — o que cada guarda protege e o que acontece se ele acender. **Leia antes de afrouxar qualquer teste.**
- [[Ferramentas de medição]] — o que mede, o que imprime, o que gera.

## Armadilhas

Coisas que parecem uma e são outra. O fio comum: **conferir o artefato cômodo em vez do que importa** (a árvore de trabalho em vez do que está commitado, o `git status` em vez do que está publicado, a URL que o deploy imprimiu em vez da origem que o servidor aceita).

Publicar, servidor e portões:
- [[Sem conexão com o servidor com o servidor inteiro no ar]]
- [[A função publicada não é a função do repositório]]
- [[Os portões verdes podem estar mentindo]]
- [[Testes que passam só na sua máquina (fim de linha)]]
- [[Teste que depende da data de hoje]]
- [[Um teste de concorrência que pisca]]
- [[Armadilhas herdadas de direções anteriores]]

Medir e provar:
- [[Medir no lugar errado faz o conserto parecer inútil]]
- [[Números e promessas que envelhecem calados]]
- [[Um guarda que mede uma amostra pode passar com a regra quebrada fora dela]]
- [[Guarda derivado não enxerga a sua mudança]]
- [[Tabela medida uma vez envelhece quando o jogo muda]]

Equilibrar:
- [[Uma busca numérica conserta pelo caminho mais curto]]
- [[Regra demais para alavanca de menos]]
- [[A tabela de eixos julga classes, não armas gêmeas]]

Arte:
- [[Arte por IA a cada quadro custa dezenas de gerações]]

## Bugs

Cada um com a causa, por que ninguém viu e o guarda que hoje acende. **Um defeito sem guarda volta**; é por isso que esta lista existe em vez de morrer no histórico do git.

Antifraude e servidor:
- [[2026-10-30 — Antifraude rejeitava jogador honesto no dia 2]]
- [[2026-10-29 — A bandeira de sem conexão nunca voltava atrás]]

Classes, habilidades e equilíbrio:
- [[2026-10-29 — A clava de madeira dava técnicas de espada]]
- [[2026-10-28 — O portão de sub-nível dizia proteger e só atrasava]]
- [[2026-10-29 — A besta liderava a Caça e o machado e o cetro eram opções mortas]]
- [[2026-10-29 — O crítico acima de 100% era jogado fora]]
- [[2026-10-29 — Trocar de arma esvaziava a rotação sem avisar]]
- [[2026-10-29 — A tela de Táticas mostrava uma recarga que o herói nunca tem]]
- [[2026-10-29 — Nomes que contradiziam o que a coisa é]]

Economia e medição:
- [[2026-10-29 — O Adubo não pagava nada a quem volta tarde]]
- [[2026-10-29 — Materiais de classe não caíam onde a classe joga]]
- [[2026-10-29 — O simulador só jogava o guerreiro]]
- [[2026-10-29 — O cartão do evento prometia +8% e o jogo pagava até +15%]]

Combate na tela, arte e código morto:
- [[2026-10-29 — A masmorra na tela perdia o tempo que o simulador guardava]]
- [[2026-10-29 — O Soberano do Abismo usava o sprite do monstro anterior]]
- [[2026-10-29 — Componentes que ninguém renderizava e um teste guardando um deles]]

Processo e testes:
- [[2026-10-29 — Metade de uma funcionalidade publicada e não commitada]]
- [[2026-10-29 — Dois testes que só passavam com fim de linha LF]]
- [[2026-10-29 — Um teste que só passava no dia seguinte à gravação]]

---

## As regras deste cofre

Herdadas do cérebro que viveu em `docs/cerebro/` até 29–30/10/2026 e que mudou para cá.

1. **Duplicou um número do código? Apague e aponte.** O que o código, as tabelas geradas ou os outros documentos já dizem, este cofre aponta; não repete. Número que aparece aqui é uma **medição datada**, e a fonte é o código e as [[Ferramentas de medição]]. Número que precisa aparecer para o jogador precisa de um teste que o prenda à configuração (modelo: `eventCards.test.ts`).
2. **Escreva a data** em que a coisa foi aprendida e o que foi **medido**, não o que se supôs.
3. **Quando algo mudar, corrija aqui também.** Um cérebro desatualizado é pior que nenhum, porque dá confiança falsa. Foi o defeito mais comum do repositório ([[Números e promessas que envelhecem calados]]).
4. **Nome de nota descritivo, em português, uma ideia por nota.** Bugs levam a data no nome (`AAAA-MM-DD — ...`) e **ligam para a armadilha que ensinaram**. Armadilhas ligam para o sistema que citam. Ligações do Obsidian (o nome da nota entre colchetes duplos), nunca caminhos.
5. **Um cérebro só.** A pasta `docs/cerebro/` ficou com um parágrafo apontando para cá. Se encontrar conhecimento do projeto escrito em dois lugares, junte.
6. A configuração pessoal do Obsidian (`.obsidian/`) **não** vai para o repositório (`.gitignore`); as **notas** vão.

## Onde está o resto

Esta é a camada de aprendizado. O que descreve o jogo e o processo vive nos documentos de sempre:

- `RESUMO_DO_PROJETO.md` — o projeto inteiro, os ambientes, o estado, os comandos
- `CLAUDE.md` — como diretor e executor trabalham, e o que pode ser feito sem perguntar
- `AGENTS.md` — os portões obrigatórios antes de qualquer commit
- `docs/GDD.md` — o jogo como desenho
- `docs/CLASSES_E_EQUIPAMENTOS.md` — a reforma de classes, com as medições (a seção 5.1.7 conta as quatro rodadas das armas e a regra que sobrou, ver [[Classes e equipamento]] e [[A tabela de eixos julga classes, não armas gêmeas]])
- `docs/EQUIPAMENTOS.md` — o catálogo de peças, **gerado**
- `docs/SEASON_RANKING.md`, `docs/WEB_LAUNCH.md` (publicar, passo do alias na seção 5.6), `docs/PERDOAR_FALSOS_POSITIVOS_2026-10-30.md`
- `docs/CORRENTE_DO_JOGO_2026-10-29.md`, `docs/PRIMEIRA_HORA_2026-10-29.md`, `docs/AUDITORIA_CLASSES_2026-10-29.md`, `docs/REVISAO_2026-10-29.md` — as medições e revisões do dia 29
