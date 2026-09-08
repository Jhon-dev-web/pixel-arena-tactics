# Raven Fantasy Icons — mapeamento para itens do jogo

Pacote fonte: `resources/asset-packs/Raven Fantasy Icons/Free - Raven Fantasy Icons/`
Ícones individuais 32x32: `Separated Files/32x32/fb<N>.png` (N = 1 a 2192, ordem raster na folha completa, 16 colunas).

Os arquivos `_reference/band_*.png` são recortes ampliados (4x/8x) da folha completa
(`Full Spritesheet/32x32.png`) com grade e número do índice `fb<N>` sobreposto — gerados para
localizar visualmente os ícones sem abrir os 2192 arquivos um a um. `band_<start>_<end>.png` cobre
as linhas `start` a `end-1` da folha (16 ícones por linha). Útil para procurar novos ícones no futuro.

## Mapeamento confirmado (itens sem arte própria, ver auditoria anterior)

Todos conferidos visualmente abrindo o `fb<N>.png` individual.

| Item (ID) | Arquivo | Observação |
|---|---|---|
| `ruby` (gema) | `fb163.png` | rubi facetado vermelho — match direto |
| `sapphire` (gema) | `fb165.png` | safira facetada azul — match direto |
| `emerald` (gema) | `fb167.png` | esmeralda facetada verde — match direto |
| `small_hp` / `large_hp` | `fb280.png` (+ variações `fb273`-`fb288`) | frasco redondo vermelho clássico; usar 2 variações próximas (ex. `fb277` menor, `fb286` maior) pra diferenciar os 2 tiers |
| `atk_elixir` | ver `fb1489`-`fb1504` (varinhas/maças com gema vermelha) ou gerar novo — nenhum frasco anguloso claro encontrado | recomendo gerar via prompt em vez de reaproveitar |
| `shards` (moeda) | sem match direto — nenhum "fragmento cristalino" solto encontrado | recomendo gerar via prompt |
| `oneTokenBalance` | sem match direto (moedas do pack são "$"/genéricas, `fb160`) | recomendo gerar via prompt |
| `leather_scrap` | `fb204.png` | pelego/couro, tom avermelhado (não é marrom puro, mas formato correto) |
| `bone_fragment` | `fb231.png` | osso curvo bege — match direto |
| `demon_claw` | `fb260.png` | garra/espinho vermelho angular |
| `concentrated_blood` | `fb270.png` ou `fb280.png` | frasco/vial vermelho |
| `corrupted_crystal` | `fb359.png` | cluster de cristal roxo irregular — bom match |
| `demon_core` | **sem match bom** | nada no pack lembra um "núcleo orgânico pulsante"; recomendo gerar via prompt |
| `ring_vitality` | `fb1848.png` | anel/sinete com gema verde — tema vitalidade bate |
| `amulet_swiftness` | `fb294.png` | pingente de gema azul em moldura dourada (cor pode ser ajustada) |
| `berserker_crest` | `fb2129.png` (banda `_reference/band_122_137.png`, linha ~133) | emblema circular vermelho com espiral |
| `gilded_warblade` | `fb1527.png` | espada dourada reta, guarda ornamentada (mais "adaga longa" que espadão grande) |
| `gilded_aegis` | `fb1809.png` | escudo redondo dourado/laranja |
| `rusty_pickaxe` | `fb1765.png` | picareta escura/gasta (linha 110, banda `band_110_111.png`) |
| `iron_pickaxe` | `fb1457.png` | picareta cinza/prata, cabo laranja |
| `steel_pickaxe` | `fb1768.png` | picareta cinza-escura, detalhe verde-azulado |
| `mithril_pickaxe` | `fb1617.png` | picareta azul-clara/ciano, cabo laranja |
| `runic_pickaxe` | `fb1763.png` | picareta roxa/ciano (tema arcano) |

Itens sem match bom (`atk_elixir`, `shards`, `oneTokenBalance`, `demon_core`) devem usar os
prompts de geração de asset já elaborados na auditoria anterior, em vez de reaproveitar ícones
deste pack.
