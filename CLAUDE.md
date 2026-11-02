# CLAUDE.md — Nyx

Player de IPTV para **Samsung TV (Tizen)**. Alvo real: Tizen 6.0 → **Chromium 76**, 1920×1080, ARMv7, 2 GB, só controle remoto.
SolidJS + Vite (bundle IIFE) · dados num **Web Worker** · vídeo pelo **AVPlay** · sem backend.
Código, comentários e commits em **pt-BR**. Interface em PT-BR/EN/ES.

Leia nesta ordem quando precisar de contexto: este arquivo → `src/data/types.ts` → o arquivo da área que vai mexer.
Produto/visão: [README.md](README.md) · próximos passos: [ROADMAP.md](ROADMAP.md) · histórico: [CHANGELOG.md](CHANGELOG.md).

## Comandos

| Comando | Para quê |
|---|---|
| `bun run dev` | app em `localhost:5173` (proxy `/__proxy` para provedor sem CORS) |
| `bun run demo` | Xtream **fictício** em `localhost:8790` (usuário/senha `demo`) |
| `bun run check` | **rode antes de commitar**: tsc + testes + build + checagem Chrome 76 |
| `bun test` | testes puros (`tests/`) |
| `./scripts/tv.sh [--seed] [--report]` | build → assina → instala → abre na TV (`TV_IP`, padrão 192.168.15.15) |
| `bun run report` | recebe logs/erros/memória da TV (build com `--report`) em `tools/.reports/nyx.jsonl` |
| `bun scripts/shot.ts <pasta> [teclas…]` | Chrome headless: aperta teclas e salva capturas (`URL`, `SHOT_PROFILE`, `WAIT_MS`) |
| `bun run release patch\|minor\|major` | sobe versão, escreve CHANGELOG, commit + tag (depois `git push --follow-tags`) |

Teclas no navegador: setas, Enter=OK, Esc/Backspace=Voltar, F1–F4=vermelha/verde/amarela/azul, PageUp/Down=CH▲▼.

## Regras que não podem quebrar (quebrou = não funciona na TV)

1. **ES2019 apenas.** `tsconfig` usa `lib: ES2019` para barrar APIs novas (`replaceAll`, `.at()`, `Object.hasOwn`, `structuredClone`…). `scripts/check-compat.ts` reprova o bundle com sintaxe ES2020+.
2. **CSS do Chrome 76:** nada de flex `gap`, `inset`, `aspect-ratio`, `clamp()/min()/max()`, `:is/:where/:has`, `:focus-visible`, `backdrop-filter`. Espaço entre filhos = `.stack`/`.row` (grid + gap) ou margem. O check reprova parte disso.
3. **Bundle IIFE e script clássico** (o app abre via `file://`). Não use import dinâmico nem `type="module"` no build.
4. **A UI nunca recebe a lista inteira.** O worker responde páginas (`Page<T>`, cursor keyset). Listas na tela: sempre `Rail`/`VGrid` (virtualizadas).
5. **Nunca mande store/proxy do Solid para o worker** (`DataCloneError`). `client.call` já faz `unwrap`, então não passe objetos que contenham proxies aninhados por outros caminhos.
6. **Não meça layout em caminho quente** (`getBoundingClientRect` força reflow). Se precisar (ex.: retângulo da prévia), meça uma vez, depois de `requestAnimationFrame`. Tela escondida mede 0×0.
7. **Animação só com `transform`/`opacity`.** Sem desfoque, sem `box-shadow` grande. `will-change` só no elemento ativo (memória de vídeo é pouca).
8. **Todo texto visível passa por `t()`.** Chave nova vai em `src/app/i18n/pt-BR.ts` (fonte) **e** em `en.ts`/`es.ts` (o TypeScript acusa se faltar).
9. **Credenciais nunca no Git.** Só em `.env.local` (ignorado) ou no `localStorage` da TV. Capturas do README só com o servidor demo.
10. **Limpe o que criar:** timer, intervalo e listener sempre com `onCleanup`. Cache no worker sempre com limite (LRU).

## Mapa

| Caminho | Responsabilidade |
|---|---|
| `src/data/types.ts` | contrato UI ↔ worker (comece por aqui) |
| `src/data/worker.ts` | **API do worker** (`api`): abrir lista, sincronizar, páginas, grade, busca, progresso, favoritos |
| `src/data/client.ts` | RPC tipado: `call('método', …)`, `latest()` (descarta respostas velhas), `onWorkerEvent` |
| `src/data/catalog.ts` | catálogo em memória: listas ordenadas (LRU), `page`, `guide`, `search`, `home`, capas com progresso |
| `src/data/xtream.ts` / `m3u.ts` | clientes e conversão para o modelo. Canais SD/HD/FHD/4K são agrupados em `groupChannels` |
| `src/data/epg.ts` | XMLTV por regex + limpeza de duplicatas/sobreposição, busca binária por janela |
| `src/data/normalize.ts` / `search.ts` / `paging.ts` | funções puras (busca ranqueada, keyset, qualidade, títulos) |
| `src/data/store.ts` / `user.ts` | IndexedDB em blocos de 4000 · favoritos, progresso, histórico |
| `src/app/focus.tsx` | **motor de foco** (ver abaixo) |
| `src/app/App.tsx` | casca: pilha de telas (montadas e escondidas), teclas, Voltar, boot, segundo plano |
| `src/app/router.ts` | `go`/`back`/`replace`/`goSection`. Seções = itens do menu lateral |
| `src/app/settings.ts` / `state.ts` | preferências (localStorage) · `dataVersion`, sync, toast |
| `src/player/engine.ts` | **motor de vídeo único** (AVPlay/`<video>`), retângulo de exibição, prévia ao vivo |
| `src/player/quality.ts` | escolha de qualidade + `StallMonitor` (troca automática). Puro, testado |
| `src/screens/*` | uma tela por arquivo |
| `src/ui/*` | design system: `tokens.css`, `components.css`, `screens.css`, `Rail`, `VGrid`, `controls`, `cards`, `overlays`, `Keyboard` |
| `tools/diag/` | app de diagnóstico que mediu a TV (base das decisões) |
| `tools/demo-server.ts` | Xtream fictício |
| `tizen/config.xml` | manifesto (privilégios, id `NyxTvApp01.Nyx`). A versão é sobrescrita pelo `package.json` no deploy |

## Modelos mentais

**Dados.** Abrir lista → worker lê o snapshot do IndexedDB (~0,3 s) → UI pronta → se estiver velho (catálogo > 12 h, grade > 6 h), sincroniza em segundo plano e emite `updated` → `dataVersion` muda → telas recarregam. Cursor keyset = `[valorDeOrdenação, id]`. A página seguinte continua certa mesmo se o catálogo mudar.

**Foco (`src/app/focus.tsx`).** Árvore de `FocusZone` (axis `row`/`col`) com folhas `useList` (axis `row`/`col`/`grid`, N itens).
- As setas andam por índice dentro da lista. Na borda, sobem para a zona pai e entram na zona vizinha (que lembra o último filho).
- `useList` registra na zona **do contexto onde é chamado**. Se a lista é desenhada dentro de um `<FocusZone>`, crie-a num componente filho renderizado dentro dele. Senão a navegação entre irmãos quebra (bug já visto 2×).
- Tela nova sem dados: `focusZone` fica "pendente" e foca quando a primeira lista ganhar itens (escolhe pela ordem do DOM).
- Teclas: `pushKeyHandler` (camadas por cima, ex. player) → `onKey` da lista ativa → Enter/`onSelect` → setas → `onKey` das zonas → `App` (Voltar).
- Voltar numa seção: conteúdo → menu → Início → sair (2×). Grade/Filmes/Séries interceptam antes (grade: agora → categorias).
- `wrap` na lista em grade = ◀ ▶ passam de fileira (teclado da busca, condicional).

**Vídeo.** `player` (`src/player/engine.ts`) é singleton, e a camada `<object type="application/avplayer">` fica fixa no `App` (`VideoLayer`), **sempre em tela cheia**. Sair do player ou o app ir para segundo plano chama `stop()` (libera a conexão; a conta tem 2).

**Player.** Teclas do canal: OK/◀ = mini-grade (`miniGuide` no worker), CH▲▼ = troca com debounce, amarela = painel de opções (qualidade, áudio, legenda, timer). Faixas via `player.tracks()/selectAudio/selectText`: a legenda embutida chega por `onSubtitle` e o app desenha. O áudio no idioma do app é escolhido sozinho (`autoAudio`). Timer: `src/player/sleep.ts` + `app/SleepWatcher.tsx` (avisa 60 s antes, depois para o vídeo e fecha o app). O player cede as teclas quando há camada isolada aberta (`trapCount()`).

**TMDB (`src/data/tmdb.ts`, opcional).** Só complementa e NUNCA lança erro: timeout de 4 s, no máximo 2 consultas simultâneas, cache no IndexedDB (30 dias para resposta, 1 dia para falha). Filmes usam o `tmdb_id` do `get_vod_info`; séries buscam por nome e, sem resultado, por nome exato sem o ano (o ano das séries no provedor costuma vir errado). As telas abrem com o provedor e aplicam o TMDB quando chega (`tmdbMovieView`/`tmdbSeriesView`/`tmdbSeasonView`). "Semelhantes que você tem" = recomendações do TMDB casadas por título e ano com o catálogo (`matchRecommendations`). Chave: `settings.tmdbKey` (Configurações › TMDB) ou `TMDB_KEY` no `.env.local` com `--seed`. O trailer abre o app do YouTube (`app/youtube.ts`, privilégio `application.launch`).

**Lembretes e novos episódios.** Lembretes ficam em `settings.reminders` (main thread); `app/ReminderWatcher.tsx` avisa 1 min antes, em qualquer tela. "Novo ep.": `UserStore.seriesBaseline` (abriu/favoritou/assistiu) comparado com `series.added` (last_modified do provedor); abrir a série chama `markSeriesSeen`.

**Qualidade automática.** O provedor entrega cada qualidade como stream separado. `pickStart` escolhe por onde começar (salvo do canal > preferência > melhor abaixo). O `StallMonitor` decide quando trocar (não abriu em 9 s, 3 travadas por minuto ou 7 s carregando), e `nextFallback` desce primeiro e só depois sobe. A qualidade que desceu sozinha fica só na sessão.

## Receitas

- **Tela nova:** `src/screens/X.tsx`, rota em `router.ts` (`Route`), `case` em `renderRoute` (`App.tsx`), CSS em `ui/screens.css`, textos nas 3 línguas.
- **Consulta nova no worker:** método em `api` (`worker.ts`), lógica em `catalog.ts` se mexe no catálogo. A UI chama `call('método', …)` (já tipado). Teste puro em `tests/` se tiver regra.
- **Configuração nova:** campo + padrão em `settings.ts`, painel em `screens/Settings.tsx`, textos.
- **Componente visual:** em `src/ui/`, só visual. O foco vem de quem usa (`focused` / `useList`). Cores e medidas dos tokens de `tokens.css`.
- **Lançar versão:** `bun run check` → commit → `bun run release patch|minor|major` → `git push --follow-tags`.

## Testar

- Lógica pura: `bun test` (agrupamento, grade, busca, keyset, M3U, qualidade).
- Tela: `bun run demo` + `bun run dev`, depois `bun scripts/shot.ts`. Olhe as capturas.
- TV: `./scripts/tv.sh --seed --report` + `bun run report`. Erros, `console.*` e memória chegam em `tools/.reports/nyx.jsonl`. O Web Inspector da TV não responde via `sdb shell 0 debug`, então não perca tempo com ele.
- O Chrome do Mac não toca stream TS ao vivo. Player e prévia só se valida na TV.

## Pegadinhas já resolvidas (não reintroduza)

- `.wgt` com espaço no nome falha ao instalar na TV (`tv.sh` renomeia para `nyx.wgt`).
- Plugin que tira `type="module"` só pode rodar no **build** (no dev quebra o import).
- `createMemo`/`createEffect` rodam na hora da criação: não use uma função `const` declarada depois deles. Leitura de relógio dentro de efeito que não deve repetir: use `untrack`.
- O AVPlay confirma o `seekTo` antes de voltar a tocar. O "carregando" segue até o tempo avançar depois do salto.
- Episódio grande pode levar mais de 9 s para abrir: VOD espera 25 s e tenta de novo 1× sozinho.
- O Vite 8 embute o CSS no `app.js` (não existe `.css` separado no build).
- **Vídeo em janela pequena (prévia/PIP) não funciona na UN50AU7700 / Tizen 6.** O AVPlay fica em PLAYING, com o tempo andando e o retângulo certo, e mesmo assim a área fica preta. Já foram tentados: `setDisplayRect` tocando, reabrir com o retângulo antes do `prepare`, `<object>` encolhido ou em tela cheia, e página transparente com furo. Foi removido na 1.0.1. Não tente de novo sem um modelo diferente para testar.
