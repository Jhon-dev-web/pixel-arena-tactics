# Armadilhas herdadas de direções anteriores

Ligações: [[Os seis portões]] · [[Testes que passam só na sua máquina (fim de linha)]] · [[Economia e materiais]] · [[Antifraude e temporada]]

Estas vieram da seção 11 do `RESUMO_DO_PROJETO.md` anterior à reescrita de 29/10, escritas por quem dirigiu o projeto antes. **Não foram medidas por quem as copiou para cá**, e estão aqui por serem caras de redescobrir. Quem confirmar ou desmentir uma delas, anote a data ao lado.

- **A cota grátis da Vercel é de 100 publicações por dia.** Por isso o build automático por push está desligado.
- **Testes SQL em PGlite rodam como superusuário.** Permissão de `anon` e `authenticated` precisa de teste explícito com `set role`, senão o teste passa sem provar nada.
- **`supabase db dump` precisa de Docker**, que não existe nesta máquina. Por isso as migrações são idempotentes e trazem um bloco de rollback no cabeçalho.
- **Migração nova que lê `reset_at`** precisa entrar na lista do `migration0009.test.ts`.
- **Executores que tiram screenshots com navegador headless** podem deixar centenas de processos abertos (perfil `arena-shot-*`) e fazer os testes estourarem o tempo. Encerre só os `--headless` desse perfil.
- **Executor que apaga "arquivos de rascunho" pode apagar trabalho do diretor.** Diga sempre, explicitamente, quais caminhos ele pode tocar.
- **Publicar artifact ou link:** publique primeiro e use a URL que o resultado devolve; nunca adivinhe o endereço.
- **Feche as abas do navegador integrado depois de testar** — a música do jogo continua tocando para o dono.

A de fim de linha, que também estava nessa lista, virou [[Testes que passam só na sua máquina (fim de linha)]], com a causa medida.
