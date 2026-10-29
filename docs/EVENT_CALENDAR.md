# Calendário de eventos (plano para o dono)

Criado em 22/10/2026 a pedido do dono ("planeje eventos e adicione um calendário no jogo"). Este documento diz **o que vai acontecer e quando**, em linguagem simples, e **como mudar**. O detalhe técnico está em `docs/SEASON_RANKING.md` (seção 11) e na migração `supabase/migrations/0035_event_calendar.sql`.

## Em uma frase

Até a Liga abrir, o jogo tem eventos em **datas reais** (horário de Brasília): uma abertura de três dias e depois um ritmo fixo por semana. Quando a Liga abrir (a meta de 1.000 Passes pagos, padrão da migration `0030_season_goal_1000.sql`; data desconhecida), os eventos de data real **param sozinhos** e o calendário da Liga (por dia da Liga) assume. O jogador vê tudo na tela **Calendário** (menu lateral), com as datas e horas no fuso dele.

Nada de economia nova: todos os eventos usam as **mesmas regras e os mesmos tetos** dos eventos da Liga que já existiam (o bônus de XP de Caça de todos os eventos somados nunca passa de +15%).

## O ritmo da pré-temporada

- **Festival de Abertura**: sáb 31/10 00h até seg 02/11 23h59 (72 h). Evento de herói, com as regras da Invasão de Monstros.
- **Toda quarta-feira (00h)**: um **dia de profissão**, de 24 a 48 horas, trocando entre Febre da Mineração, Festival dos Ofícios e Semana das Profissões.
- **Toda sexta-feira 18h até domingo 23h59 (54 h)**: um **evento de herói de fim de semana**, trocando entre Invasão de Monstros, Caçada ao Alvo, Corrida da Masmorra, Fenda Temporal e Grande Entrega.
- Um evento por vez, sempre com descanso entre dois.
- São 8 semanas, de 04/11 a 27/12.

## Calendário da pré-temporada (horário de Brasília)

| # | Quando | Evento | Tipo | O que faz |
| --: | --- | --- | --- | --- |
| 1 | sáb 31/10 00h a seg 02/11 23h59 | Festival de Abertura | herói | Ondas que crescem: sequência de lutas vencidas rende mais XP de Caça. |
| 2 | qua 04/11 (24 h) | Febre da Mineração | profissão | +25% de minério em cada sessão de Mineração. |
| 3 | sex 06/11 18h a dom 08/11 23h59 | Invasão de Monstros | herói | Ondas que crescem; sequência sem cair rende até +10% de XP de Caça. |
| 4 | qua 11/11 a qui 12/11 (48 h) | Festival dos Ofícios | profissão | +15% de XP de profissão em Mineração, Lenhador e Horta. |
| 5 | sex 13/11 18h a dom 15/11 23h59 | Caçada ao Alvo | herói | Um alvo raro a cada 300 lutas; quem vence ganha +8% de XP de Caça por 1h30. |
| 6 | qua 18/11 a qui 19/11 (48 h) | Semana das Profissões | profissão | O jogador escolhe UMA profissão: +25% de XP nela. |
| 7 | sex 20/11 18h a dom 22/11 23h59 | Corrida da Masmorra | herói | Cada chefe da Masmorra paga 120 de Ouro e +8% de XP de Caça por 4 h. |
| 8 | qua 25/11 (24 h) | Febre da Mineração | profissão | +25% de minério. |
| 9 | sex 27/11 18h a dom 29/11 23h59 | Fenda Temporal | herói | Inimigos 25% mais fortes; sequência de vitórias rende até +10% de XP de Caça. |
| 10 | qua 02/12 a qui 03/12 (48 h) | Festival dos Ofícios | profissão | +15% de XP de profissão. |
| 11 | sex 04/12 18h a dom 06/12 23h59 | Grande Entrega | herói | Cada pedido recebido dá +10% de XP de Caça por 3 h. |
| 12 | qua 09/12 a qui 10/12 (48 h) | Semana das Profissões | profissão | Escolha UMA profissão: +25% de XP. |
| 13 | sex 11/12 18h a dom 13/12 23h59 | Invasão de Monstros | herói | Como o evento 3. |
| 14 | qua 16/12 (24 h) | Febre da Mineração | profissão | +25% de minério. |
| 15 | sex 18/12 18h a dom 20/12 23h59 | Caçada ao Alvo | herói | Como o evento 5. |
| 16 | qua 23/12 a qui 24/12 (48 h) | Festival dos Ofícios | profissão | +15% de XP de profissão. |
| 17 | sex 25/12 18h a dom 27/12 23h59 | Corrida da Masmorra | herói | Como o evento 7. |

Se a Liga abrir antes de 27/12, os eventos que ainda não começaram saem do calendário e o que estiver rodando termina na hora da abertura.

## Calendário da Liga (por dia da Liga)

O dia 1 é o dia em que a Liga abre. Antes de abrir, o jogo mostra estes eventos como "Liga: dia N" e avisa que as datas aparecem quando ela abrir. Depois de aberta, cada evento ganha data e hora reais.

| # | Dias | Evento | Tipo | Horas |
| --: | --- | --- | --- | --: |
| 1 | 3-4 | Invasão de Monstros | herói | 48 |
| 2 | 6 | Febre da Mineração | profissão | 24 |
| 3 | 10-11 | Corrida da Masmorra | herói | 36 |
| 4 | 13-14 | Festival dos Ofícios | profissão | 48 |
| 5 | 17-18 | Caçada ao Alvo | herói | 48 |
| 6 | 21-23 | Semana das Profissões | profissão | 72 |
| 7 | 25-26 | Invasão de Monstros | herói | 48 |
| 8 | 28 | Febre da Mineração | profissão | 24 |
| 9 | 30-31 | Caçada ao Alvo | herói | 48 |
| 10 | 33-35 | Semana das Profissões | profissão | 72 |
| 11 | 37-38 | Corrida da Masmorra | herói | 36 |
| 12 | 40-41 | Festival dos Ofícios | profissão | 48 |
| 13 | 43 | Grande Entrega | herói | 24 |
| 14 | 45 | Febre da Mineração | profissão | 24 |
| 15 | 47 | Fenda Temporal | herói | 24 |
| 16 | 49-51 | Semana das Profissões | profissão | 72 |
| 17 | 53-54 | Invasão de Monstros | herói | 48 |
| 18 | 56-60 | Corrida Final | final | 120 |

Os eventos 1 a 6 (dias 3 a 23) são as **semanas leves**, novas: um evento de herói por semana ("de fim de semana") e um dia de profissão, com descanso entre dois. Os eventos 7 a 18 são o calendário que já existia (Rodada 22), sem mudança. A **Corrida Final** (últimos 5 dias) dá +5% de XP de Caça por 24 h no dia em que o jogador coleta as quatro metas diárias.

## O que cada evento faz (uma linha)

- **Festival de Abertura / Invasão de Monstros**: sequência de lutas vencidas sem cair rende +1% de XP de Caça a cada 50 (até +10%); os inimigos ficam 3% mais fortes a cada 100 vitórias seguidas (até +30%); uma derrota termina a onda.
- **Caçada ao Alvo**: a cada 300 lutas vencidas aparece um alvo raro (o dobro de vida, 1,5 vez o dano); vencer dá +8% de XP de Caça por 1h30.
- **Corrida da Masmorra**: cada chefe da Masmorra derrotado paga 120 de Ouro e +8% de XP de Caça por 4 h.
- **Fenda Temporal**: inimigos 25% mais fortes; sequência de vitórias na caça automática rende +1% a cada 25 (até +10%).
- **Grande Entrega**: cada pedido recebido dá +10% de XP de Caça por 3 h (o pedido ainda gasta os materiais).
- **Febre da Mineração**: +25% de minério em cada sessão de Mineração (e do XP dela).
- **Festival dos Ofícios**: +15% de XP de profissão em Mineração, Lenhador e Horta.
- **Semana das Profissões**: o jogador escolhe UMA profissão e ganha +25% de XP nela durante o evento.
- **Corrida Final**: veja acima.

## O que o jogador vê

- **Menu lateral → Calendário** (e um botão "Abrir calendário" no painel Eventos do Acampamento).
- **Mês**: grade de dias com os eventos em barras coloridas (dourado = herói, azul = profissão, verde = final); tocar num dia mostra os eventos dele; setas para mudar de mês e botão "Hoje".
- **Lista**: "Agora" (com a contagem regressiva do que termina), "Próximos" (com a contagem do próximo) e "Passados". Cada evento mostra nome, data e hora no fuso do jogador e o que ele faz.
- **Liga**: antes de abrir, uma seção "Liga" lista os eventos por dia ("Liga: dia 3 a 4") com o aviso de que as datas aparecem quando ela abrir.
- **Sem conta (build offline/desktop)**: a tela diz "Eventos só no jogo online" e não há eventos.

## Como mudar

Tudo da pré-temporada fica na tabela `arena_private.event_calendar` (SQL Editor do Supabase, como dono). Os horários levam `-03` (Brasília).

```sql
-- ver
select id, event_id, starts_at at time zone 'America/Sao_Paulo' as inicio, ends_at at time zone 'America/Sao_Paulo' as fim, note
from arena_private.event_calendar order by starts_at;

-- adicionar (ids: launch_festival, invasion, target_hunt, dungeon_race, grand_delivery, time_rift,
-- mining_fever, crafts_festival, profession_week; no máximo 7 dias)
insert into arena_private.event_calendar (event_id, starts_at, ends_at, note)
values ('invasion', '2026-12-31 18:00-03', '2027-01-03 00:00-03', 'Réveillon');

-- mover
update arena_private.event_calendar set starts_at = '2026-11-13 12:00-03', ends_at = '2026-11-16 00:00-03' where id = 4;

-- apagar
delete from arena_private.event_calendar where id = 4;
```

- O banco **recusa** um evento que se sobreponha a outro ("um evento por vez").
- O jogo lê o calendário ao entrar e a cada 15 minutos: a mudança aparece para quem estiver jogando em até 15 minutos.
- Para mudar o calendário **da Liga** (dias 3 a 60) ou as regras de um evento, é mudança de código (`src/game/leagueEvents.ts`, depois `npm run season:tables` e a função `league_events()` no SQL); o teste `migration0014.test.ts` confere que o jogo e o SQL continuam iguais.
- Evento novo (outra regra) também é código; não use um id que não esteja na lista acima.

## O que precisa ser aplicado

1. **Migração `0035_event_calendar.sql`** (cria a tabela, a semente, `public.calendar_events()` e troca `public.league_events()` pela versão de 18 eventos). Idempotente.
2. **Republicar a função `submit-progress`**: a auditoria passou a ler `calendar_events()` para não marcar como suspeito quem joga um evento de data real.
3. **Republicar o jogo** (tela Calendário, regras dos eventos datados).

Sem a migração aplicada, o jogo continua funcionando: a tela mostra "não foi possível carregar o calendário" e nenhum evento de data real roda.
