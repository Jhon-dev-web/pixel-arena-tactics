# Perdoar quem o teto de andar marcou sem motivo — 30/10/2026

**Para quem lê depois:** o teto de andar por nível (`BOUNDS.floorCapByLevel`) ficou desatualizado desde a Rodada 28 (commit `be910bd`, 20/10), que multiplicou por 3,3 o custo dos primeiros níveis e não remediu esta tabela. Entre 20/10 e 30/10 o servidor **rejeitou todo jogador novo honesto no dia 2** (nível 13, andar 25, teto 14) e **marcou** donos do Passe. A tabela foi corrigida e a função `submit-progress` republicada em 30/10 (commit `14110b9`).

**Republicar não perdoa ninguém.** As linhas já gravadas em `progress_snapshots` continuam lá, e pela seção 2 do [`SEASON_RANKING.md`](SEASON_RANKING.md) conta com marca aberta fica **fora do ranking e do campeonato**. Perdoar é um passo separado, feito à mão, no banco de produção.

## Passo 1 — ver quem seria perdoado (só leitura, rode primeiro)

Pega só as contas cujas marcas são **exclusivamente** deste defeito. Quem tiver qualquer outro motivo no histórico **não** aparece aqui e deve ser olhado à mão.

```sql
select s.user_id,
       count(*) filter (where s.verdict = 'rejected') as rejeitados,
       count(*) filter (where s.verdict = 'flagged')  as marcados,
       min(s.created_at) as primeiro,
       max(s.created_at) as ultimo
from public.progress_snapshots s
where s.verdict <> 'ok'
group by s.user_id
having bool_and(s.reasons <@ array['FLOOR_ABOVE_LEVEL_CAP']::text[])
   and bool_and(cardinality(s.reasons) > 0)
order by rejeitados desc, marcados desc;
```

Se a lista vier vazia, ninguém foi atingido e não há nada a fazer.

## Passo 2 — perdoar

`progress_clear_flags(uuid, nota, rebase)` grava uma linha de auditoria por snapshot em `progress_flag_clears` (quem, quando, por quê; **nada é apagado**), esvazia `season_entries.flags` e devolve quantos foram perdoados.

O terceiro argumento é a escolha que importa:

| | O que faz | Quando usar |
|---|---|---|
| `false` | Só perdoa. Os próximos envios continuam sendo julgados a partir do último snapshot **`ok`** da conta. | Quem foi só **marcado** (tem `ok` recente). |
| `true` | Perdoa **e** copia o último snapshot marcado como um novo `ok` (`MANUAL_BASELINE`), que passa a ser a base. | Quem ficou **rejeitado vários dias seguidos**: o último `ok` dele é velho, e sem rebase o próximo envio vira um salto grande em cima de uma base antiga. |

Pela medição, os jogadores comuns ficavam rejeitados de 3 a 5 envios seguidos — para esses, `true` é o certo. Rodar um de cada vez, com a lista do passo 1 na mão:

```sql
select public.progress_clear_flags(
  '<uuid-da-conta>',
  'teto de andar por nivel desatualizado desde 20/10 rejeitava jogador honesto no dia 2; corrigido e republicado em 30/10',
  true
);
```

## Depois

Rode o passo 1 de novo: a lista tem de vir vazia. O guarda que faltava existe agora (`src/game/__tests__/honestPlayerAntifraud.test.ts`): ele falha se qualquer jogador honesto simulado for rejeitado **ou** marcado, então este defeito não volta em silêncio.

**Depois:** o `FLOOR_PACE` e a primeira descida (`DEPTH_PACE`) foram remedidos em 30/10; os números e o que o trapaceiro ganha estão em `supabase/functions/_shared/progress/bounds.ts`.

## Resultado, conferido em 30/10/2026

**Não havia ninguém para perdoar.** No banco havia 99 envios de 5 contas, e nenhum com `FLOOR_ABOVE_LEVEL_CAP`. O defeito foi medido em jogadores simulados e não atingiu nenhuma conta real. Nada foi alterado no banco.

Existe uma única conta com rejeições, por outro motivo: 49 envios em 20/10 com `PASS_FEATURES_WITHOUT_ENTITLEMENT` (recompensas premium sem Passe ativo). Ela não entra nesta receita.
