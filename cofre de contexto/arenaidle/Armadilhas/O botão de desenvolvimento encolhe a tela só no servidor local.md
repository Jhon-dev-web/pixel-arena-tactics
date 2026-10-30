# O botão de desenvolvimento encolhe a tela só no servidor local

Aprendido em 30/10/2026, medindo o menu novo em 375 px.

No servidor de desenvolvimento existe o botão `dev-admin-fab` (`import.meta.env.DEV`, em `src/App.tsx`). Ele entra no fluxo da página e toma 20 px da largura: a tela útil fica com 355 px, e não 375.

Por isso a barra de cima parecia sobrepor "Nv 40" e o ícone de ouro, e sem o botão não há sobreposição. Antes de chamar algo de aperto de largura, remova esse botão na medição ou meça o site publicado.

Medir com folga falsa também engana no sentido contrário: uma tela que cabe em 355 px cabe em 375, mas uma tela cortada no servidor local pode estar certa no celular.

Ver [[Medir no lugar errado faz o conserto parecer inútil]].
