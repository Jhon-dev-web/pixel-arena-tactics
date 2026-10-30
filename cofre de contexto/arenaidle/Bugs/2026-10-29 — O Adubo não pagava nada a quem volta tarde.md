# O Adubo não pagava nada a quem volta tarde

Data: 29/10/2026 (commit `3ac1563`). Ensinou: [[Guarda derivado não enxerga a sua mudança]] · [[A função publicada não é a função do repositório]] · Sistema: [[Economia e materiais]] · [[Antifraude e temporada]] · Guarda: [[Guardas que existem]]

**O que acontecia.** O Adubo só encurtava o tempo de crescimento. Para quem volta a cada 12 ou 24 horas, não pagava nada: a planta já estava pronta quando ele voltava, com ou sem adubo. Medido na véspera: **+0%** nos dois, enquanto quem volta a cada 8 h, 6 h e 4 h recebe +100%, +100% e +50%. O dono joga duas vezes por dia, então ele e quem joga como ele gastavam um consumível que não fazia nada, sem como perceber.

**Conserto.** A colheita paga **25% mais** XP de Jardinagem quando a economia foi desperdiçada, isto é, quando a planta já esperava pronta ao menos o tempo que o Adubo economiza. Quem o Adubo ajudou recebe exatamente o que sempre recebeu (as linhas de 8 h, 6 h e 4 h não mudam uma casa decimal). Foi XP e não unidades, porque uma planta rende uma ou duas unidades, então o menor bônus de unidade possível seria +50% e quebraria o teto de +40% que `garden3.test.ts` já guarda.

**O antifraude que isto teria quebrado em silêncio.** O servidor aceita por canteiro colhido no máximo `BOUNDS.gardenLongestPlantXp`, derivado da planta crua: 80. Com o bônus, uma planta de 16 h paga **100**. Um jogador honesto que adubasse uma raiz anciã ou uma seda do vazio e voltasse tarde seria marcado como trapaceiro. A derivação em `seasonBoundsDerive.ts` agora inclui o bônus e o limite acompanha o jogo em 100. Com o limite de volta a 80, o guarda falha com "expected 80 to be greater than or equal to 100" (conferido antes de commitar). O limite por hora não precisou mexer: já admite 2,24x pela economia de tempo, e o bônus e a economia nunca valem juntos. Detalhe da lição em [[Guarda derivado não enxerga a sua mudança]].

**Não está no ar até republicar as funções.** `bounds.ts` mora em `supabase/functions/_shared`, então as funções publicadas ainda carregam 80.

**O nome "Dodge".** A habilidade nunca esquivou nada: é uma rajada de +35% de velocidade de ataque por 4 s a cada 16 s. Passou a se chamar **Arrancada** em português e **Surge** em inglês, nos três lugares que a mostram (o nome em Táticas, o texto que surge na luta, e os rótulos do painel de tunables do dono). O id interno continua `dodge`: mudar apontaria para o nada toda rotação já salva no save de jogador. O commit abre dizendo que são duas das seis mudanças que o dono aprovou naquele dia.

**Guardas.** `gardenFertilizerIdle.test.ts` (visita a cada 12 ou 24 h rende mais XP com Adubo que sem, e por menos que o +40% do guarda antigo; paga na colheita e só em canteiro adubado; quem o Adubo ajudou recebe exatamente o que sempre recebeu) e `seasonProgress.test.ts` (o limite do servidor).

**Medida da ferramenta.** `scripts/tools/gardenFertilizer.tool.ts` imprime o valor do Adubo por padrão de visita (ver [[Ferramentas de medição]]).
