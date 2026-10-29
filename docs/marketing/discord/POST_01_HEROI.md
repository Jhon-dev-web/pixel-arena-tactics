# Primeiro post no Discord — o herói de Arena Idle

Preparado em 23/10/2026. Proposta para revisão do dono. Nenhuma mensagem foi publicada.

## Intenção

Apresentar algo reconhecível do jogo na primeira postagem: o mesmo herói em três armaduras. A imagem precisa ajudar quem acabou de chegar a reconhecer Arena Idle e entender que existe progressão de equipamento.

A pauta enviada pelo dono é uma referência, não uma obrigação. Começar pelo herói faz sentido; eu reduziria a sequência de posts sobre dinheiro/mercado e manteria o início concentrado no jogo funcionando.

## Arte

Arquivo de publicação em inglês: `arena-idle-post-01-hero-en.png`, nesta pasta. O rascunho anterior em português foi preservado como `arena-idle-post-01-heroi.png`.

Composição promocional horizontal com as aparências inicial, bronze e dragão, baseada nos sprites oficiais existentes. Não apresentar como captura de gameplay. Paleta roxo/azul-noturno e dourado, cenário discreto de ruínas, poucos textos e personagens legíveis no celular.

Texto na imagem:

> ARENA IDLE
>
> SAME HERO. NEW ARMOR.
>
> BROWSER IDLE RPG

É a **armadura equipada** que define o visual. O código atual possui oito aparências base em `HERO_LOOKS`, em `src/game/gear.ts`. Não usar “cada peça muda o visual”, pois isso daria a entender que luvas, anéis e todas as outras peças mudam o sprite separadamente.

## Legenda pronta para o Discord

> Meet the hero of Arena Idle.
>
> You start with simple gear. Hunt for materials, forge new equipment, and change your hero's look with the armor you equip.
>
> Arena Idle is a pixel-art idle RPG played right in your browser. Choose an activity, let your hero keep going while you're away, and return to collect what they've gathered.
>
> Over the next few posts, I'll show you actual gameplay from the hunt, the forge, and the dungeon.
>
> Which of these three looks would you choose?

A arte e a legenda devem ser publicadas em inglês, conforme pedido do dono. A voz pode ser alterada de “I'll show” para “we'll show” se o canal representar uma equipe. Não adicionar @everyone automaticamente.

## Ordem sugerida para continuar

| Post | Assunto | Prova visual mais adequada |
| --- | --- | --- |
| 1 | O herói e as armaduras | Esta imagem de apresentação. |
| 2 | Como o idle funciona | Vídeo curto real: escolher atividade, sair e resgatar na volta; deixar o limite de armazenamento claro. |
| 3 | Forja e equipamento | Captura/vídeo real de materiais, produção e resultado. |
| 4 | Masmorra | Combate real, chefe e progresso de andar. |
| 5 | Profissões e Horta | Mostrar a escolha de atividade do herói e a Horta em paralelo. |
| 6 | Mercado entre jogadores | Fluxo real e condições de negociação; mostrar certificação nesse contexto, sem prometer sistema invulnerável. Bolsas podem ser um complemento deste assunto. |
| 7 | Passe | Benefícios e validade, com preço e condições atuais conferidos antes da publicação. |
| 8 | Liga e pré-temporada | Regras, ranking e reset explicados com o regulamento que estiver aprovado. |
| 9 | Datas, calendário e Kit Pioneiro | Datas e requisitos vigentes, conferidos no momento de publicar. |

Não é necessário cumprir uma postagem por dia. Se uma pergunta recorrente aparecer na comunidade, ela pode virar a próxima postagem. Evitar quatro publicações seguidas sobre mercado/bolsas antes de as pessoas entenderem e desejarem jogar.

## Cuidados de linguagem

- Preferir demonstrações reais para os próximos sistemas; não gerar uma falsa captura de interface ou resultado de forja.
- Não anunciar PvP como funcionalidade existente, NFT, token próprio ou retorno financeiro.
- Não escrever “o que você forja sempre pode ser vendido”: existem regras de raridade, vínculo ao equipar e certificação.
- Trocar “sem duplicação” por uma explicação factual do registro/certificação do servidor, se esse tema for abordado.
- Não prometer coleta ilimitada ou progresso sem escolher uma atividade; o armazenamento tem limite.
- Não embutir data de lançamento ou endereço de teste nesta primeira arte. Usar URL pública e datas apenas quando aprovadas para divulgação.

## Produção da imagem

Ferramenta: gerador de imagem integrado, com referências locais oficiais; sem CLI/API externa configurada pelo usuário. Nenhum código de jogo, save, asset original ou configuração de publicação foi alterado.

Referências: `hero_peasant_v2.png`, `hero_bronze_v2.png` e `hero_dragon_v2.png`, de `public/assets/spritesheets/`. São folhas de animação 4×4; o prompt pede somente a pose parada do primeiro quadro, não uma folha de sprites na imagem final.

Prompt utilizado:

O prompt abaixo registra a composição inicial. A localização final para inglês usa [POST_01_EN_PROMPT.txt](POST_01_EN_PROMPT.txt), preservando a arte escolhida. O arquivo `arena-idle-post-01-hero-en.png` é a versão final indicada para publicação.

```text
Use case: ads-marketing.
Asset type: first Discord community announcement image for the existing browser RPG ARENA IDLE. Create ONE polished original promotional image, horizontal 16:9, ideally 1536x864 or equivalent high resolution.
Primary request: introduce the ACTUAL game's hero through three of his actual armor appearances, with strong game identity and truthful visual progression. Make it feel like a carefully art-directed indie pixel RPG announcement, not generic AI fantasy advertising.
Input images: reference image 1 is the official hero in starter ragged clothes; reference image 2 is the official same hero in bronze armor; reference image 3 is the official same hero in dragon armor. These are 4x4 animation sprite sheets, NOT layouts to reproduce. For each reference use ONLY the first standing idle pose in its top-left frame. The same young male hero with messy dark indigo hair and the same stylized face/proportions must be recognizable in all three. Preserve the exact recognizable outfit colors, sword, silhouettes and details of each reference; do not invent another character or armor. No sprite-sheet grid or animation strip in the final.
Scene/backdrop: a restrained, atmospheric medieval stone courtyard at night, ancient weathered arches and fortress silhouettes, indigo-purple sky, soft mist and just a few distant amber torch lights. The scene is visible and readable, not mostly solid black. An authentic 2D game environment in pixel art, not photorealism or painterly concept art.
Composition: three full-body idle appearances arranged clearly left to right: starter clothes, bronze, dragon. All three stand at the same ground level with comfortable separation, big enough to appreciate at Discord mobile preview size. They represent the same hero changing armor, not a multiplayer party. Keep their shared face and size consistent. Give the dragon armor a restrained warm edge light, not explosions or particles. A single cohesive environment, no individual cards, frames, boxes, arrows, stat panels or infographic ornaments. Background has less detail behind characters and text.
Typography: a strong, clean large pixel-font ARENA IDLE heading in warm muted gold in the upper part. One short, very readable secondary line beneath it. A small plain pixel-font category line near the bottom. Good spacing, few words. All text must be correctly rendered VERBATIM, with no additional words:
Main heading: "ARENA IDLE"
Secondary line: "O MESMO HERÓI. NOVAS ARMADURAS."
Bottom small line: "RPG IDLE NO NAVEGADOR"
Style: crisp deliberately clustered pixels, cohesive limited palette matching the official sprites, restrained dithering, clean high-quality indie pixel-art promotional composition. Dark navy, deep purple, warm gold; bronze and dragon red are specific armor accents. Sharp readable silhouette and clear midtones. No blur, photographic textures, 3D, smooth glossy anime repainting or generic epic ornate fantasy typography.
Constraints: do not add currencies, coins, wallets, crypto/NFT/token motifs, financial returns, PvP, dates, countdowns, rarity percentages, other logos, Discord logo, UI, watermarks, decorative borders or extra characters. Do not claim gameplay screenshot: this is a promotional composition using the actual hero appearance references. Keep visual elements well inside a 6% safe margin.
```
