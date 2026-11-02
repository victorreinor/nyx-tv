# Changelog

Versões seguem [SemVer](https://semver.org/lang/pt-BR/): **correção** sobe o último número (1.0.1),
**funcionalidade** sobe o do meio (1.1.0), **mudança grande** sobe o primeiro (2.0.0).
Gerado por `bun run release patch|minor|major`.

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
