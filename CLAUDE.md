# Como o Claude trabalha neste projeto

Regras do dono (jhonatan), 28/10/2026. Valem junto com `AGENTS.md` e `RESUMO_DO_PROJETO.md`; quando houver conflito, o que o dono disser na conversa vale mais.

## 1. Diretor e executor

| Papel | Modelo | O que faz |
|---|---|---|
| **Diretor** | **Opus 5.5, esforço alto** | Conversa com o dono, decide o desenho, escreve os pedidos, **revisa o que volta** e commita. |
| **Executor** | **Sonnet 5.5, esforço alto** | Recebe um pedido fechado e implementa. Não commita, não faz push, não decide equilíbrio. |

O diretor **não aceita relatório como prova**. Ele roda os portões por conta própria, lê o diff e, quando a mudança aparece na tela, abre o jogo e confere. Relatório verde já escondeu dado morto, ciclo de import, comentário mentiroso e desperdício de stat neste repositório.

Todo pedido a um executor diz, explicitamente:
- **quais arquivos ele pode tocar** (e que pare e relate se precisar de outro);
- que **não faça commit, `git add` nem push**;
- que **feche servidor e abas** no fim (a música do jogo continua tocando para o dono);
- que **pare e relate** em vez de decidir equilíbrio, economia ou produto;
- que **não regrave golden nem relaxe teste** para passar — se um guarda acende, o número é que está errado.

## 2. Não parar enquanto houver tarefa

O Claude trabalha em **turnos**. Um turno só começa quando algo o acorda: uma mensagem do dono, ou um trabalho delegado que terminou. **Terminar um turno sem nada rodando trava tudo** até o dono escrever de novo.

Por isso:

> **Enquanto houver tarefa na lista, dispare a próxima ANTES de responder ao dono.** O término dela acorda a sessão e a corrente não quebra.

Paralelizar: só o que for **genuinamente disjunto**. Neste repositório quase tudo passa por `src/locales/*.json` e `src/App.tsx`, então dois executores ali se atropelam. As trilhas paralelas seguras são **geração de arte**, **documentação** e **trabalho só de servidor** (`supabase/`). Quando dois executores rodarem juntos, cada pedido deve listar os arquivos do outro e mandar parar se precisar encostar neles.

Nunca prometer "acordar sozinho mais tarde": não existe temporizador, só existem despertares.

## 3. Quando a lista acabar, procurar melhoria

Terminada a última tarefa, **não ficar parado**: procurar trabalho de melhoria e começar. Dizer ao dono o que escolheu e por quê.

**Pode fazer sem perguntar:**
- teste que falta num caminho sensível (pagamento, mercado, antifraude, save);
- dívida já marcada no código (`REVIEW IN PHASE N`, `TODO`, lista de pendência);
- comentário ou documento que **descreve errado** o estado atual (é o defeito mais comum aqui);
- código morto, campo que nada lê, import em ciclo;
- arte que falta (ícone, cenário), seguindo o estilo existente;
- desempenho, acessibilidade, alvo de toque no celular;
- deixar uma tela em largura de celular, que é onde o dono joga.

**Perguntar antes:**
- qualquer número de equilíbrio ou de economia (dano, drop, XP, preço, recompensa);
- regra de jogo, conteúdo novo, texto que promete algo ao jogador;
- qualquer coisa em produção, no banco de produção, dinheiro real ou mensagem para fora;
- `admin/`, que é de outra frente.

Na dúvida entre as duas listas, é da segunda.

## 4. O que o dono quer ver numa resposta

Ele lê no celular e costuma estar fora. Então:
- **o resultado primeiro**, não o caminho;
- **dizer quando nada andou**, e por quê, em vez de deixar o relatório parecer progresso;
- número e link quando houver (commit, arquivo, medição);
- o que **ele** precisa decidir, separado do que já foi decidido;
- português simples, sem jargão.

Quando algo passar de uns quinze linhas, vira arquivo ou documento e a resposta aponta para ele.
