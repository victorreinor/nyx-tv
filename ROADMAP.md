# Roadmap do Nyx

Ordem = valor para quem assiste ÷ esforço. Cada item diz o porquê em uma linha.

## v0.1 — base (em construção)

- [x] Diagnóstico do motor da TV (Tizen 6 / Chromium 76): mediu WebSQL, IndexedDB, workers e busca
- [x] Camada de dados em Web Worker: catálogo Xtream/M3U, cache em blocos no IndexedDB, busca em memória, paginação keyset
- [x] Canais SD/HD/FHD/4K agrupados em um só, com seletor de qualidade
- [x] Grade de programação (XMLTV) limpa de duplicatas
- [ ] Telas: Início, TV ao vivo (grade), Filmes, Séries, detalhes, Busca, Favoritos, Configurações
- [ ] Player AVPlay com troca automática de qualidade quando trava
- [ ] Continuar assistindo (episódio e segundo exatos), próximo episódio automático
- [ ] Listas Xtream e M3U, idiomas PT-BR/EN/ES, PIN para adultos (padrão 0000)
- [ ] README e CLAUDE.md

## v0.2 — ganhos rápidos no uso diário

- [ ] **Sintonizar por número**: digitar `1`, `0`, `5` no controle vai para o canal 105.
- [ ] **Último canal**: tecla dedicada alterna entre o canal atual e o anterior.
- [ ] **Mini-grade no player**: ver e trocar de canal sem sair da tela cheia.
- [ ] **Timer para dormir**: desligar o vídeo em 15/30/60/90 min. Combina com o uso à noite.
- [ ] **Faixas de áudio e legenda** no player (dublado/legendado), pelas APIs de faixa do AVPlay.
- [ ] **Prévia ao vivo na grade**: depois de 1,5 s parado num canal, toca uma miniatura. Usa 1 das 2 conexões da conta.
- [ ] **"Agora na TV"** na Início: filmes e jogos que estão começando, tirados da grade.
- [ ] **Novos episódios**: selo nas séries favoritas quando o provedor adicionar episódio.

## v0.3 — descoberta e conforto

- [ ] **Enriquecimento pelo TMDB** (opcional, com chave): fundos, trailer, elenco com foto e notas.
- [ ] **Busca na grade**: "onde passa futebol hoje", procurando nos títulos dos programas.
- [ ] **Lembretes**: avisar quando um programa da grade começar.
- [ ] **Perfis**: favoritos e progresso separados por pessoa, com um perfil infantil travado por PIN.
- [ ] **Organizar canais**: esconder, reordenar e renumerar.
- [ ] **Proteção de tela**: escurece depois de um tempo parado, para poupar a tela no escuro.
- [ ] **Busca por voz**: botão que abre o teclado nativo da TV, que já tem microfone.

## v1.0 — distribuição e manutenção

- [ ] **Atualização sem cabo**: o app instalado carrega o bundle mais novo de uma URL (GitHub Pages), com a versão local como reserva se a rede falhar.
- [ ] **CI**: GitHub Actions com testes, checagem de compatibilidade e `.wgt` assinado anexado a cada release.
- [ ] **Backup do usuário**: exportar/importar favoritos e progresso (QR code ou arquivo).
- [ ] **Relatório de erros** opcional (Sentry), para ver travamentos que acontecem na TV.
- [ ] **Medidor de desempenho** em modo dev: FPS e tempo de cada tela, para pegar regressões.
- [ ] **Acessibilidade**: modo texto grande e alto contraste.

## Ideias para avaliar

- **Catch-up / voltar no tempo**: depende de canais com `tv_archive`. A lista atual tem 0, então só vale se o provedor mudar.
- **Várias listas juntas**: ver duas listas como um catálogo só.
- **Controle pelo celular**: precisa de um servidor intermediário. Pesa mais do que entrega por enquanto.
- **Sincronizar entre aparelhos**: precisaria de backend. A arquitetura atual deixa plugar um depois.
