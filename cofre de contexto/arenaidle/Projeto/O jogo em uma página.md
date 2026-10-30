# O jogo em uma página

Voltar: [[Comece aqui]] · Sistemas: [[Classes e equipamento]] · [[Caça e masmorra]] · [[Economia e materiais]] · [[Antifraude e temporada]] · Regras do dono: [[Decisões do dono]]

Fonte viva: `RESUMO_DO_PROJETO.md` (estado e ambientes) e `docs/GDD.md` (o jogo como desenho). Esta página só diz o que alguém precisa saber **antes** de abrir o código. Quando discordar deles, vale o código, depois o `RESUMO_DO_PROJETO.md`.

## O que é

**Arena Idle** é um RPG idle em pixel art jogado **só no navegador**, no computador ou no celular (o dono joga no celular). Não há versão Steam nem PC instalável. Stack: React 18, Vite, TypeScript; servidor em Supabase (Postgres e Edge Functions em Deno); site na Vercel.

O herói progride sozinho enquanto o jogador está fora: caça, minera, corta madeira, cuida da horta, forja e desce a masmorra. O jogador volta, recolhe, equipa e decide o próximo passo. **Regra de desenho: não é um jogo para ficar assistindo.** A Caça é uma cena pequena no mapa mais o inventário; a arena animada só existe na Masmorra.

## As atividades

| | |
|---|---|
| **Caça** | a única fonte de XP e de material de combate ([[Caça e masmorra]]) |
| **Masmorra** | 100 andares, ouro, gemas, chefes; abre as zonas de Caça |
| **Mineração, Lenhador, Horta** | material de coleta; não dão XP de herói |
| **Forja e Ofícios** | equipamento e material refinado ([[Economia e materiais]]) |
| **Táticas** | 21 habilidades concedidas pelo equipamento; o jogador escolhe até 4 e a ordem ([[Classes e equipamento]]) |
| **Pedidos** | entregas de material com prazo (`docs/DELIVERY_ORDERS.md`) |
| **Mercado, Passe e Temporada** | monetização e ranking ([[Antifraude e temporada]]) |

## Três ideias que tudo o mais pressupõe

1. **Não existe classe escolhida.** É o reflexo do que o herói veste (peso da armadura mais linha da arma). Misturar sempre funciona.
2. **O CP não decide nada.** É termômetro. Os portões da Caça pedem índice de equipamento; a justiça entre classes é medida por eixo. É a coisa mais fácil de desfazer por engano.
3. **O servidor não aceita às cegas.** Ouro, inventário e timers ainda são calculados no cliente e conferidos contra limites; o servidor sorteia a raridade, certifica o item e julga o ritmo. Por isso mexer em número do jogo pode exigir mexer em tabela do servidor e **republicar** ([[A função publicada não é a função do repositório]]).

## Dinheiro

- **Passe de Aventureiro**: pago só em USDC, na rede Solana. **Mercado entre jogadores**: peças épicas ou melhores e material de coleta negociável, em SOL, sem custódia (o comprador paga direto à carteira do vendedor), com taxa de 5%.
- Não há NFT nem token próprio: "NFT", na fala do dono, quer dizer mercado com pagamento em cripto. Nada é cunhado na blockchain ([[Decisões do dono]]).
- Stripe e Pix foram removidos. Há código dormente de Stripe em `supabase/functions/_shared/` ([[O que está em aberto]]).

## Ambientes

Só existe o de **teste**: o jogo em `arena-idle-teste.vercel.app` (o único endereço que as funções aceitam) e o projeto Supabase `ncufhkoyphktvmhmivxa`, plano grátis. **Produção ainda não existe.** Publicar são dois passos ([[Sem conexão com o servidor com o servidor inteiro no ar]]). Detalhe e estado das migrações: `RESUMO_DO_PROJETO.md` seções 6 e 7.

## Onde está o que

`src/game/` lógica (e `__tests__/`), `src/components/` telas, `src/locales/pt.json` e `en.json` (sempre iguais em sentido), `supabase/functions/` e `supabase/migrations/`, `scripts/sim/` e `scripts/tools/` ([[Ferramentas de medição]]), `docs/`. **`admin/` é de outra frente: não mexa.**

## Antes de qualquer commit

[[Os seis portões]], rodados numa cópia limpa de `HEAD`, não na árvore de trabalho ([[Os portões verdes podem estar mentindo]]).
