# Dois testes que só passavam com fim de linha LF

Data: 29/10/2026 (commit `ae3228a`). Ensinou: [[Testes que passam só na sua máquina (fim de linha)]] · Achado por: [[Os portões verdes podem estar mentindo]]

**O que acontecia.** Verificando `HEAD` numa cópia limpa, dois arquivos de teste falharam num clone novo e passavam no checkout de quem os escreveu. Ambos leem arquivos-fonte e afirmam contra literais de várias linhas escritos com LF, enquanto o git entrega esses arquivos com CRLF no Windows (`core.autocrlf=true`).

- `marketWiring.test.ts` fatiava `src/market.css` em `'\n}\n'`, recebia `-1` e acabava afirmando sobre a string de dois caracteres `'@m'`;
- `migration0007.test.ts` compara assinaturas SQL inteiras de função.

**Por que ninguém viu.** Passam no CI Linux, onde o checkout é LF. Falham para quem clona no Windows. É a pior forma de um teste estar errado: a máquina que o pegaria é a que nunca o roda.

**Conserto.** Os dois normalizam o fim de linha ao ler. Nenhuma asserção foi afrouxada.

**Guarda.** Os próprios testes, agora corrigidos. O que protege contra a próxima ocorrência é o hábito de rodar os portões numa cópia limpa de `HEAD` ([[Os portões verdes podem estar mentindo]]). Os dois pontos de leitura já normalizam; testes novos que leem arquivo devem normalizar também.
