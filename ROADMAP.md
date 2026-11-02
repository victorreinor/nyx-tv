# Roadmap do Nyx

Ordem = valor para quem assiste ÷ esforço. Cada entrega vira uma versão (SemVer, ver [CHANGELOG](CHANGELOG.md)).

## 1.0 — base ✅

- [x] Diagnóstico do motor da TV (Tizen 6 / Chromium 76): mediu WebSQL, IndexedDB, workers e busca
- [x] Camada de dados em Web Worker: Xtream/M3U, cache em blocos no IndexedDB, busca em memória, paginação keyset
- [x] Canais SD/HD/FHD/4K agrupados em um só, com seletor de qualidade e troca automática quando trava
- [x] Grade de programação (XMLTV) limpa de duplicatas
- [x] Telas: Início, TV ao vivo, Filmes, Séries, detalhes, Busca, Favoritos, Configurações
- [x] Continuar assistindo (episódio e segundo), botão e reprodução automática do próximo episódio
- [x] Abas "Continuar assistindo" e "Assistidos"; capas com "T2 E5"/"Visto"; limpar histórico
- [x] Idiomas PT-BR/EN/ES, PIN para adultos, versões (SemVer + CHANGELOG), README e CLAUDE.md
- [x] 1.0.1: prévia ao vivo na grade removida (vídeo preto na UN50AU7700)
- [x] 1.0.2: Voltar na grade traz a hora atual **e** o canal que estava tocando

## 1.1 — player

- [ ] **Mini-grade no player**: lista de canais com "agora/a seguir" por cima do vídeo em tela cheia; troca sem sair do player.
- [ ] **Timer para dormir**: 15/30/60/90 min; aviso de 1 min antes, com opção de continuar.
- [ ] **Áudio e legenda** (dublado/legendado), pelas faixas do AVPlay. A legenda é desenhada pelo app. Precisa validar na TV, porque depende de cada stream.

## 1.2 — séries e grade

- [ ] **Novos episódios**: selo nas séries favoritas quando o provedor adicionar episódio (compara com a última vez que você abriu a série).
- [ ] **Lembretes**: na grade, marcar um programa futuro; quando começar, o app avisa e OK sintoniza. Só funciona com o Nyx aberto, porque a TV não deixa app comum avisar fechado.

## 1.3 — TMDB à prova de falhas

- [ ] **Enriquecimento pelo TMDB** (opcional, com chave gratuita): fundos, trailer, elenco com foto e notas.
  - Filmes: o provedor já manda o `tmdb_id` no detalhe, então a busca é exata. Séries: busca por nome + ano.
  - A tela nunca espera o TMDB: abre com os dados do provedor e o TMDB só complementa quando chega.
  - Cada consulta tem limite de 4 s e no máximo 2 rodam ao mesmo tempo, dentro do worker.
  - As respostas ficam em cache por 30 dias; as falhas ficam anotadas por 1 dia, para não insistir.
  - Se o TMDB cair, o app fica igual ao de hoje.

## Depois

- [ ] **Sintonizar por número**: digitar `1`, `0`, `5` no controle vai para o canal 105.
- [ ] **Último canal**: tecla dedicada alterna entre o canal atual e o anterior.
- [ ] **Busca na grade**: "onde passa futebol hoje", procurando nos títulos dos programas.
- [ ] **Perfis**: favoritos e progresso separados por pessoa, com um perfil infantil travado por PIN.
- [ ] **Organizar canais**: esconder, reordenar e renumerar.
- [ ] **Proteção de tela**: escurece depois de um tempo parado, para poupar a tela no escuro.
- [ ] **Busca por voz**: botão que abre o teclado nativo da TV, que já tem microfone.

## 2.0 — distribuição e manutenção

- [ ] **Atualização sem cabo**: o GitHub Actions publica cada versão no GitHub Pages (`victorreinor.github.io/nyx-tv`, gratuito). A TV baixa a versão nova em segundo plano e usa na próxima abertura, com verificação por hash e volta automática se a nova travar.
- [ ] **CI**: testes, tipos e checagem do Chrome 76 a cada envio; `.wgt` assinado anexado a cada release.
- [ ] **Backup do usuário**: exportar/importar favoritos e progresso (QR code ou arquivo).
- [ ] **Relatório de erros** opcional (Sentry), para ver travamentos que acontecem na TV.
- [ ] **Medidor de desempenho** em modo dev: FPS e tempo de cada tela, para pegar regressões.
- [ ] **Acessibilidade**: modo texto grande e alto contraste.

## Ideias para avaliar

- **Prévia ao vivo na grade (vídeo na caixinha)**: tentada e removida na 1.0.1. Na UN50AU7700 o vídeo em janela pequena fica preto (detalhes no CLAUDE.md). Só vale retomar com outro modelo de TV para testar.
- **Catch-up / voltar no tempo**: depende de canais com `tv_archive`. A lista atual tem 0, então só vale se o provedor mudar.
- **Várias listas juntas**: ver duas listas como um catálogo só.
- **Controle pelo celular**: precisa de um servidor intermediário. Pesa mais do que entrega por enquanto.

<sub>"Agora na TV" saiu da lista: a fileira "Ao vivo nos seus favoritos / Canais que você viu" da Início já cumpre esse papel.</sub>
