# Guarda derivado não enxerga a sua mudança

Ligações: [[2026-10-29 — O Adubo não pagava nada a quem volta tarde]] · [[Tabela medida uma vez envelhece quando o jogo muda]] · [[A função publicada não é a função do repositório]] · [[Antifraude e temporada]] · [[Guardas que existem]]

**Sintoma.** Você muda um número do jogo que aumenta o que o jogador ganha. Roda a suíte inteira: verde, inclusive o teste que compara o jogo com os limites do servidor. Ainda assim, o servidor vai marcar jogador honesto como trapaceiro.

**Caso real (29/10/2026).** O Adubo passou a pagar +25% de XP de Jardinagem quando a economia de tempo dele é desperdiçada. O servidor aceita no máximo `BOUNDS.gardenLongestPlantXp` por canteiro numa colheita: 80. Com o bônus, uma planta de 16 h paga **100**. O guarda `seasonProgress.test.ts` compara o limite com um valor **derivado do jogo**, e continuou verde — porque a derivação (`scripts/sim/seasonBoundsDerive.ts`) calculava `max(plantHarvestXp(p))`, a planta **crua**, e não sabia que existia um bônus na colheita.

**A lição, que é mais larga que o caso.** Um guarda derivado só protege o que a **derivação** enxerga. Quando a derivação e o jogo divergem, o guarda fica verde e errado — o pior dos dois mundos, porque ele dá a sensação de que foi conferido.

**O que fazer.** Ao mexer num número que o servidor limita, não pergunte "o teste passou?". Pergunte: **"a conta que gera esse limite conhece a minha mudança?"** Abra a derivação e procure o seu número lá dentro. Se ele não estiver, o guarda é cego, e consertar a derivação vem **antes** de mexer no limite.

**Como confirmar que o conserto vale.** Depois de ensinar a derivação, volte o limite ao valor antigo e veja o guarda **ficar vermelho**. Se ele continuar verde, a derivação ainda não está vendo. (No caso real: com o limite de volta a 80, o guarda falhou com "expected 80 to be greater than or equal to 100".)

**E o limite mora no servidor.** `supabase/functions/_shared/**` só vale para o jogador depois de `supabase functions deploy`. Commit não publica. Ver [[A função publicada não é a função do repositório]].

**Outros lugares onde o mesmo cuidado foi tomado em 29–30/10**, cada um com o limite re-medido junto com a mudança de conteúdo e a decisão escrita no commit:

- o crítico que passa de 100% voltando como dano crítico: o XP por hora ficou em 0,95 do limite e o pior dia de material em 0,55 do teto diário (0,59 nos materiais de caça), então nada precisou ser republicado ([[2026-10-29 — O crítico acima de 100% era jogado fora]]);
- a pena que passou a cair na Clareira: o pico honesto medido subiu de 148 para 152 sem mudar o teto diário, e o pior caso ficou em 0,58 ([[2026-10-29 — Materiais de classe não caíam onde a classe joga]]);
- o teto diário de tendão estava errado desde antes: nem era uma medição, era uma proporção de 140 no lugar de um 74 subestimado. Medido direito com o conteúdo novo, 218, e o teto passou de 9 para 14.

A pergunta vale para todos: "a conta que gera esse limite conhece a minha mudança?"
