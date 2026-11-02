# Roadmap do Nyx

Ordem = valor para quem assiste ÷ esforço. Cada item diz o porquê em uma linha.

## 1.0 — base ✅

- [x] Diagnóstico do motor da TV (Tizen 6 / Chromium 76): mediu WebSQL, IndexedDB, workers e busca
- [x] Camada de dados em Web Worker: Xtream/M3U, cache em blocos no IndexedDB, busca em memória, paginação keyset
- [x] Canais SD/HD/FHD/4K agrupados em um só, com seletor de qualidade e troca automática quando trava
- [x] Grade de programação (XMLTV) limpa de duplicatas
- [x] Telas: Início, TV ao vivo, Filmes, Séries, detalhes, Busca, Favoritos, Configurações
- [x] Continuar assistindo (episódio e segundo), botão e reprodução automática do próximo episódio
- [x] Abas "Continuar assistindo" e "Assistidos"; capas com "T2 E5"/"Visto"; limpar histórico
- [x] Idiomas PT-BR/EN/ES, PIN para adultos, versões (SemVer + CHANGELOG), README e CLAUDE.md

## 1.1 — ganhos rápidos no uso diário

- [ ] **Sintonizar por número**: digitar `1`, `0`, `5` no controle vai para o canal 105.
- [ ] **Último canal**: tecla dedicada alterna entre o canal atual e o anterior.
- [ ] **Mini-grade no player**: ver e trocar de canal sem sair da tela cheia.
- [ ] **Timer para dormir**: desligar o vídeo em 15/30/60/90 min. Combina com o uso à noite.
- [ ] **Faixas de áudio e legenda** no player (dublado/legendado), pelas APIs de faixa do AVPlay.
- [ ] **"Agora na TV"** na Início: filmes e jogos que estão começando, tirados da grade.
- [ ] **Novos episódios**: selo nas séries favoritas quando o provedor adicionar episódio.

## 1.2 — descoberta e conforto

- [ ] **Enriquecimento pelo TMDB** (opcional, com chave): fundos, trailer, elenco com foto e notas.
- [ ] **Busca na grade**: "onde passa futebol hoje", procurando nos títulos dos programas.
- [ ] **Lembretes**: avisar quando um programa da grade começar.
- [ ] **Perfis**: favoritos e progresso separados por pessoa, com um perfil infantil travado por PIN.
- [ ] **Organizar canais**: esconder, reordenar e renumerar.
- [ ] **Proteção de tela**: escurece depois de um tempo parado, para poupar a tela no escuro.
- [ ] **Busca por voz**: botão que abre o teclado nativo da TV, que já tem microfone.

## 2.0 — distribuição e manutenção

- [ ] **Atualização sem cabo**: o app instalado carrega o bundle mais novo de uma URL (GitHub Pages), com a versão local como reserva se a rede falhar.
- [ ] **CI**: GitHub Actions com testes, checagem de compatibilidade e `.wgt` assinado anexado a cada release.
- [ ] **Backup do usuário**: exportar/importar favoritos e progresso (QR code ou arquivo).
- [ ] **Relatório de erros** opcional (Sentry), para ver travamentos que acontecem na TV.
- [ ] **Medidor de desempenho** em modo dev: FPS e tempo de cada tela, para pegar regressões.
- [ ] **Acessibilidade**: modo texto grande e alto contraste.

## Ideias para avaliar

- **Prévia ao vivo na grade (vídeo na caixinha)**: tentada e removida na 1.0.1. Na UN50AU7700 o vídeo em janela pequena fica preto (detalhes no CLAUDE.md). Só vale retomar com outro modelo de TV para testar.

- **Catch-up / voltar no tempo**: depende de canais com `tv_archive`. A lista atual tem 0, então só vale se o provedor mudar.
- **Várias listas juntas**: ver duas listas como um catálogo só.
- **Controle pelo celular**: precisa de um servidor intermediário. Pesa mais do que entrega por enquanto.
- **Sincronizar entre aparelhos**: precisaria de backend. A arquitetura atual deixa plugar um depois.
