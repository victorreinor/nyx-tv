# Changelog

Versões seguem [SemVer](https://semver.org/lang/pt-BR/): **correção** sobe o último número (1.0.1),
**funcionalidade** sobe o do meio (1.1.0), **mudança grande** sobe o primeiro (2.0.0).
Gerado por `bun run release patch|minor|major`.

## [1.6.0] — 2026-11-08

### Novidades
- diagnóstico da lista, erros que explicam o motivo e episódios novos conferidos

### Correções
- modal aberta não perde mais o foco para a tela de trás (lembrete sem botão focado)

## [1.5.0] — 2026-11-07

### Novidades
- atalhos no ícone do Nyx (continuar assistindo, novos episódios e canais) — precisa reinstalar o .wgt

### Correções
- mini-grade do canal aberto por atalho, busca ou lembrete mostra o grupo do canal (favoritos só pelos favoritos)

### Outros
- chore: tv.sh reinicia o sdb quando ele trava e para com erro se a TV não conectar

## [1.4.3] — 2026-11-07

### Correções
- progresso salvo mesmo saindo do app de repente e Voltar carregando não deixa vídeo escondido

### Outros
- chore: release pega os commits desde o último "release: v" e não põe coautoria

## [1.4.2] — 2026-11-03

### Correções
- "Baixar a lista de novo" não regrava o que não mudou e cache do TMDB vencido é apagado

### Outros
- docs: apresentação do Nyx em HTML e PDF

## [1.4.1] — 2026-11-02

### Correções
- botão focado não corta na borda dos painéis de Configurações e avisos de versão ficam 8 s

### Outros
- merge: v1.3.1 da outra sessão + v1.4.0

## [1.4.0] — 2026-11-02

### Novidades
- atualização sem cabo pelo GitHub Pages, com hash e volta automática
- quem tem a 1.3.1 ou anterior instala esta pelo celular/PC uma última vez; daqui em diante o Nyx se atualiza sozinho

## [1.3.1] — 2026-11-02

### Novidades
- nyx.wgt em cada release do GitHub para instalar pelo celular

### Outros
- merge: nyx.wgt nos releases (outra sessão) + v1.3.0

## [1.3.0] — 2026-11-02

### Novidades
- TMDB à prova de falhas, busca com abas e selos de versão

### Outros
- chore: tira worktree de outra sessão que entrou por engano e ignora .claude/worktrees

## [1.2.0] — 2026-11-02

### Novidades
- novos episódios e lembretes da grade

## [1.1.6] — 2026-11-02

### Correções
- carregando aparece na hora do salto e não pisca mais

## [1.1.5] — 2026-11-02

### Correções
- vídeo que para em silêncio volta a mostrar "Carregando…"

## [1.1.4] — 2026-11-02

### Correções
- feedback e controles bloqueados enquanto filme/episódio carrega ou volta de um salto

## [1.1.3] — 2026-11-02

### Correções
- carregamento com feedback, seek bloqueado até o vídeo começar e painel de opções

## [1.1.2] — 2026-11-02

### Correções
- cancela a leitura de faixas pendente ao trocar de canal ou sair do player

## [1.1.1] — 2026-11-02

### Correções
- mini-grade vazia e CH▲▼ parado ao abrir canal pela Início

## [1.1.0] — 2026-11-02

### Novidades
- player com mini-grade, opções de áudio/legenda e timer para dormir

### Outros
- docs: reorganiza o ROADMAP (1.1 player, 1.2 séries/grade, 1.3 TMDB)

## [1.0.2] — 2026-11-02

### Correções
- Voltar na grade volta para a hora atual e para o canal que estava tocando

### Outros
- chore: selo de versão do README acompanha o release

## [1.0.1] — 2026-11-02

### Correções
- remove a prévia ao vivo da grade (vídeo preto na UN50AU7700)

## [1.0.0] — 2026-11-02

Primeira versão.

### Novidades
- Listas Xtream Codes e M3U (link M3U de servidor Xtream vira Xtream automaticamente)
- Dados em Web Worker com cache em blocos no IndexedDB: abre em menos de 1 s
- Busca em memória com ranking (10–35 ms na TV), paginação keyset
- Canais SD/HD/FHD/4K agrupados em um só, com seletor de qualidade
- Qualidade automática: desce de 4K → FHD → HD → SD quando o canal trava
- Grade de programação (XMLTV) limpa de duplicatas, com linha do "agora"
- Continuar assistindo (episódio e segundo exatos) e próximo episódio automático
- Botão "Próximo episódio" no fim do episódio (tempo ajustável)
- Abas "Continuar assistindo" e "Assistidos" em Filmes e Séries; capas mostram "T2 E5" e "Visto"
- Troca de canal com debounce (CH ▲▼ seguidos só sintonizam onde você parou)
- Seek com tempo de destino, saltos que aceleram e carregando até voltar a tocar
- Configurações: listas, idioma (PT-BR/EN/ES), PIN para adultos (padrão 0000),
  qualidade padrão, categorias ocultas, histórico, armazenamento
- Design system próprio com tema noturno; listas e grades virtualizadas

### Correções
- Envio de objetos reativos ao worker ("nenhuma lista aberta")
- Grade sem programação depois de navegar para dias sem dados
- Episódios que falhavam na primeira tentativa (agora espera mais e tenta de novo sozinho)
- Teclado da busca: setas passam de fileira e chegam em Espaço/Apagar/Limpar
