# 📲 Instalar o Nyx na sua TV Samsung

<sub>[English](INSTALL.md) · Português</sub>

O Nyx não está na loja da Samsung. Você instala **uma vez** com o **[Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung)**,
um app gratuito da comunidade que manda o Nyx para a TV pelo Wi‑Fi. Ele roda no celular (Android) ou no computador
(Windows, macOS, Linux). Não precisa de Tizen Studio. Depois disso, o Nyx abre na TV como qualquer outro app, sem o celular.

**Você precisa de:**

- TV Samsung de **2021 em diante** (Tizen 6.0 ou mais novo).
- Celular ou computador no **mesmo Wi‑Fi** da TV (não use rede de convidados).
- Em TVs de 2023 em diante (Tizen 7+), uma **conta Samsung** gratuita.

## 1. Baixe o Apps2Samsung

- **Android:** baixe o arquivo que termina em `-android.apk` no [último release](https://github.com/Apps2Samsung/Apps2Samsung/releases/latest) e instale.
  Se usa Obtainium ou F‑Droid, dá para adicionar por lá e ele se atualiza sozinho (veja o [README deles](https://github.com/Apps2Samsung/Apps2Samsung#-get-the-android-app-auto-updating)).
- **Computador:** baixe a versão do seu sistema na [mesma página](https://github.com/Apps2Samsung/Apps2Samsung/releases/latest).

Abra o app e anote o **IP** do celular ou computador. Ele aparece nas configurações como *Local IP* e tem a cara de `192.168.0.20`.

## 2. Ligue o Modo Desenvolvedor na TV

1. Aperte **Home** no controle e abra **Apps**.
2. Digite `1` `2` `3` `4` `5` no controle. Se o controle não tem números, aperte **123** e digite na tela.
3. Ligue o **Modo desenvolvedor** e coloque em **IP do PC host** o IP do passo 1.
4. Reinicie a TV.

O Modo Desenvolvedor só aceita instalação vinda desse IP.

## 3. Instale o Nyx

1. No Apps2Samsung, escolha a sua TV. Ele procura sozinho no Wi‑Fi. Se não achar, digite o IP da TV.
2. Procure **Nyx** no catálogo, em **IPTV & Live TV**, e toque em **Instalar**.
   Se o Nyx ainda não aparecer no catálogo, baixe o [`nyx.wgt`](https://github.com/victorreinor/nyx-tv/releases/latest/download/nyx.wgt)
   e escolha como **`.wgt` próprio**.
3. Se ele pedir, entre na sua conta Samsung. É só na primeira vez: a Samsung emite o certificado que faz a TV aceitar o app.

Pronto: o Nyx abre na TV. Adicione a sua lista (Xtream Codes ou M3U) e já pode assistir.

## Atualizar

O Nyx se atualiza sozinho pela internet: baixa a versão nova em segundo plano e usa na próxima vez que abrir.
Em *Configurações › Sobre* aparecem a versão, o estado da atualização e o botão **Procurar agora**.
Se uma versão nova não abrir direito, o Nyx volta sozinho para a anterior.

Use o instalador só em dois casos: se o seu Nyx é a versão 1.3 ou anterior (ainda não tinha atualização sozinho),
ou se *Configurações › Sobre* disser que a versão nova precisa ser instalada pelo celular ou PC (acontece quando muda algo do pacote, como permissões).

O Apps2Samsung mostra os apps instalados na TV e avisa quando sai versão nova do Nyx. Atualize por ele mesmo.
Se você instalou pelo `.wgt` próprio, baixe o `nyx.wgt` de novo pelo mesmo link e instale do mesmo jeito.

Suas listas, favoritos e progresso continuam lá, **desde que você atualize pelo mesmo instalador da primeira vez**.
Cada instalador assina o Nyx com uma chave diferente, e a TV recusa a troca.

## Se der problema

| Problema | O que fazer |
|---|---|
| O Apps2Samsung não acha a TV | Confira se estão no mesmo Wi‑Fi, se o Modo Desenvolvedor está ligado com o IP certo e se a TV foi reiniciada. Se ainda não achar, tire a TV da tomada por 15 segundos e ligue de novo. |
| O IP aparece invertido na TV (`20.0.168.192`) | A TV está num idioma escrito da direita para a esquerda. Digite o IP de trás para frente. |
| *Author certificate not match* | O Nyx já foi instalado por outro instalador ou outro computador. Desinstale na TV (segure **OK** no ícone do Nyx → **Excluir**) e instale de novo. Isso apaga as listas salvas. |

## Outra opção: TV Installer (Android)

O [TV Installer](https://github.com/sunic007/tvinstaller) faz a mesma coisa, só no Android 7+. Ligue o Modo Desenvolvedor com o IP do celular,
adicione um `.wgt` próprio por link e cole:

```
https://github.com/victorreinor/nyx-tv/releases/latest/download/nyx.wgt
```

---

<sub>Apps2Samsung e TV Installer são projetos independentes da comunidade, não são do Nyx nem da Samsung.
O Nyx é um player: ele não fornece, hospeda nem vende conteúdo.</sub>
