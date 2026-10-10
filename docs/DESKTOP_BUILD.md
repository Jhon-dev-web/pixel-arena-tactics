# Build desktop (Windows / Steam)

O jogo roda como app de desktop usando **Electron**. O build gera uma pasta "desempacotada" (`release/win-unpacked/`), que é exatamente o formato que um depot da Steam espera (sem instalador).

```text
desktop/main.cjs      processo principal (janela, protocolo app://, segurança, smoke test)
desktop/preload.cjs   preload mínimo (contextIsolation + sandbox); só expõe window.arenaDesktop
desktop/icon.png      ícone 256x256 (gerado de public/assets/icons/dragon_flameblade.png, ampliado 8x sem suavização)
electron-builder.yml  configuração do empacotamento (win x64, alvo `dir`)
scripts/desktop-build.mjs, scripts/desktop-dev.mjs
```

## Como rodar

| Comando | O que faz |
| --- | --- |
| `npm run desktop:dev` | Sobe o Vite na porta 5200 (`DESKTOP_DEV_PORT` muda; `ARENA_DEV_URL` aponta para um servidor já existente) e abre a janela Electron apontando para ele, com hot reload e DevTools. |
| `npm run desktop:build` | Gera `dist-desktop/` (bundle web em modo `desktop`) e empacota em `release/win-unpacked/Arena Duel.exe`. |
| `npm run desktop:start` | Abre o Electron com o `dist-desktop/` já construído (sem empacotar). |

Pré-requisito: `npm install` (Electron baixa o binário do GitHub Releases na primeira execução; electron-builder baixa um pacote de ícones).

### O que o modo `desktop` faz de diferente do build web

`vite build --mode desktop` (veja `vite.config.ts`). O build web (`npm run build`) **não muda** (saída idêntica byte a byte).

- Não lê nenhum `.env*` (`envDir: false`) e força `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` vazias, tanto no script quanto via `define`. O app empacotado roda 100% local, sem Supabase, independente do `.env.local` de quem compila. Confirmado: o bundle não contém nenhuma URL `supabase.co`.
- Move o `<style>` e os `<script>` inline do `index.html` para arquivos (`desktop-inline-*.css/js`) porque a CSP proíbe código inline. O script de `postMessage` para o iframe pai (só faz sentido na plataforma web) é descartado; o shim do `window.DebugPanel` é mantido.
- Saída em `dist-desktop/` (não sobrescreve `dist/`).

### Segurança

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; DevTools só fora do build empacotado.
- O jogo é servido por um protocolo privilegiado `app://game/` (não `file://`), com proteção contra path traversal (`..`, `%2e%2e`, barras invertidas, letras de drive); só serve arquivos dentro de `dist-desktop/`.
- Navegação para qualquer origem diferente da do app é bloqueada; links `https:` abrem no navegador do sistema (`shell.openExternal`), qualquer outro esquema é ignorado. `window.open` é negado.
- Todas as permissões do navegador são negadas (o jogo não precisa de nenhuma; áudio não pede).
- CSP enviada pelo protocolo: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. (`data:` em imagens porque o Vite embute assets pequenos como data URI.) Quando houver backend ou Steam web API, o domínio entra em `connect-src` em `desktop/main.cjs`.

### Janela

1280x720 por padrão, mínimo 1024x600, centralizada, fundo `#07050b` (o mesmo do `body`), `show` só em `ready-to-show`, sem barra de menu na versão empacotada. **F11** e **Alt+Enter** alternam tela cheia. Tamanho, posição, maximizado e tela cheia são lembrados em `window-state.json` na pasta de dados do usuário. Uma segunda instância apenas foca a primeira. `autoplay-policy: no-user-gesture-required` está ligado para o áudio poder iniciar sem clique.

## Onde ficam os saves

O jogo salva em `localStorage`. Com a origem estável `app://game`, o Electron persiste isso na pasta de dados do usuário:

```text
%APPDATA%\Arena Duel\            (ex.: C:\Users\<usuário>\AppData\Roaming\Arena Duel\)
  Local Storage\leveldb\         <- o save do jogo
  window-state.json              <- tamanho/posição da janela
```

Para apagar o progresso de teste, feche o jogo e apague essa pasta. **Atenção:** a origem faz parte da chave. Se o nome do app (`productName`) ou o host `game` mudarem no futuro, os saves antigos deixam de ser encontrados; trate isso como compatibilidade de save. Para a Steam Cloud, o caminho natural é exportar o `SaveData` para um arquivo (`userData\saves\`) e apontar o Auto-Cloud da Steam para ele; isso ainda não existe.

## Smoke test (CI / conferência do empacotamento)

Inerte, a não ser que o executável receba `--smoke-test`:

```text
"Arena Duel.exe" --smoke-test --smoke-out=<pasta> --smoke-user-data=<pasta> [--smoke-marker=<texto>]
```

Espera o jogo renderizar, confere que `#root` tem filhos e que não há erro de console, requisição falha (4xx/5xx no protocolo), requisição externa, violação de CSP ou imagem quebrada, testa uma requisição `Range` de áudio, grava `result.json` e `screenshot.png` em `--smoke-out` e sai com código 0 (ok) ou 1. `--smoke-user-data` isola os dados do teste dos do jogador. `--smoke-marker` grava um valor no `localStorage` e devolve o valor anterior (`markerBefore`), o que prova que o save sobrevive a fechar e abrir o app.

## O que NÃO existe ainda (de propósito)

- **Steamworks.** Sem App ID ainda. O ponto de encaixe está comentado em `desktop/main.cjs` ("Steam hook") e em `desktop/preload.cjs`: criar `desktop/steam.cjs` (steamworks.js ou similar: `init`, conquistas, overlay, Cloud) e chamá-lo antes de criar a janela, de forma opcional para o jogo continuar abrindo fora da Steam. Para testar localmente com a Steam, coloque um `steam_appid.txt` ao lado do `.exe` (não vai para o depot final).
- **Auto-update.** A Steam atualiza o jogo; não há `electron-updater`.
- **Assinatura de código.** O `.exe` não é assinado. **Importante:** em Windows 11 com o *Smart App Control* ligado, executáveis não assinados e sem reputação são bloqueados (Política de Controle de Aplicativo). Foi o que aconteceu na máquina de desenvolvimento: o `Arena Duel.exe` recém-gerado é bloqueado. Para distribuir, assine com um certificado de code signing (EV/OV ou Azure Trusted Signing) via `win.certificateSubjectName`/`CSC_LINK` no electron-builder. Enquanto isso, dá para validar o app rodando o `app.asar` com o `electron.exe` do `node_modules`: `node_modules\electron\dist\electron.exe release\win-unpacked\resources\app.asar --smoke-test ...`.
- **macOS / Linux.** Só `win x64`.
- Nenhum `.env*` entra no pacote: só `package.json`, `desktop/**` e `dist-desktop/**` vão para o `app.asar` (sem `node_modules`, sem fontes `.map`).

## Subir para a Steam com SteamCMD (documentação; nada disso foi executado)

1. **Pré-requisitos (Steamworks partner):** pagar a taxa do app, criar o App ID e um depot Windows (ex.: `APPID` e `DEPOTID`). Em *SteamPipe > Depots*, associe o depot ao pacote do app. Em *Installation > General*, crie a opção de lançamento: executável `Arena Duel.exe`, sistema operacional Windows.
2. **Baixar o SteamCMD** (Valve, só na máquina de build) e criar uma conta de build com permissão "Edit App Metadata" e "Publish App Changes To Steam".
3. **Gerar o build:** `npm run desktop:build`. A pasta a enviar é `release/win-unpacked/` (~390 MB em disco; a Steam comprime). Rode o smoke test antes (veja acima) e, quando houver certificado, assine o `.exe`.
4. **`depot_build_<DEPOTID>.vdf`:**

   ```text
   "DepotBuildConfig"
   {
     "DepotID" "<DEPOTID>"
     "ContentRoot" "C:\caminho\pixel-arena-tactics\release\win-unpacked"
     "FileMapping"
     {
       "LocalPath" "*"
       "DepotPath" "."
       "recursive" "1"
     }
     "FileExclusion" "steam_appid.txt"
   }
   ```

5. **`app_build_<APPID>.vdf`:**

   ```text
   "AppBuild"
   {
     "AppID" "<APPID>"
     "Desc" "Arena Duel 0.1.0"
     "BuildOutput" "C:\caminho\steam-build-output"
     "ContentRoot" ""
     "SetLive" ""
     "Depots"
     {
       "<DEPOTID>" "depot_build_<DEPOTID>.vdf"
     }
   }
   ```

   Deixe `SetLive` vazio na primeira vez e promova o build para a branch no painel do Steamworks.
6. **Enviar:** `steamcmd +login <conta_de_build> +run_app_build "C:\caminho\app_build_<APPID>.vdf" +quit` (a primeira vez pede o código do Steam Guard).
7. **Conferir:** no painel do Steamworks, em *SteamPipe > Builds*, confira o build, ponha na branch (ex.: `beta`), instale pelo cliente Steam e abra o jogo.
8. Antes do lançamento: integrar o Steamworks (conquistas, Cloud), assinar o `.exe`, vendorizar a fonte e revisar a CSP para o que for adicionado.

## Licenças de terceiros

- **Press Start 2P** (fonte do jogo): SIL Open Font License 1.1, copyright 2012 The Press Start 2P Project Authors. Vem do pacote npm `@fontsource/press-start-2p` (só o subset latin, peso 400, que cobre ã, ç, é, õ), empacotada pelo Vite como asset local; nada é carregado do Google Fonts. O texto da licença fica em `public/licenses/press-start-2p-OFL.txt` e é copiado para o build web e para o app.
- **Electron / Chromium**: o build empacotado inclui `LICENSE.electron.txt` e `LICENSES.chromium.html` ao lado do `.exe`; mantenha-os na pasta enviada para a Steam.
