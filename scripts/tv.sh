#!/usr/bin/env bash
# Compila, empacota, assina, instala e abre o Nyx na TV.
#
#   ./scripts/tv.sh            build + instalar + abrir
#   ./scripts/tv.sh --seed     já entra com a lista do .env.local (não precisa digitar na TV)
#   ./scripts/tv.sh --report   logs/erros da TV chegam no Mac (rode `bun run report` antes)
#   ./scripts/tv.sh --debug    abre com o Web Inspector e imprime a porta
#
# Variáveis: TV_IP (padrão 192.168.15.15), TIZEN_PROFILE (padrão nyx), MAC_IP (detectado),
#   UPDATE_URL (de onde a TV baixa atualizações; padrão GitHub Pages, "off" desliga; teste: tools/update-server.ts).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIZEN="$HOME/tizen-studio/tools/ide/bin/tizen"
SDB="$HOME/tizen-studio/tools/sdb"
TV_IP="${TV_IP:-192.168.15.15}"
TARGET="$TV_IP:26101"
PROFILE="${TIZEN_PROFILE:-nyx}"
APP_ID="NyxTvApp01.Nyx"
MAC_IP="${MAC_IP:-$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo 127.0.0.1)}"
OUT="$ROOT/.build/tv"

SEED=0 REPORT=0 DEBUG=0
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
    --report) REPORT=1 ;;
    --debug) DEBUG=1 ;;
    *) echo "opção desconhecida: $arg" >&2; exit 1 ;;
  esac
done

cd "$ROOT"
if [ "$SEED" = 1 ]; then
  set -a; . ./.env.local; set +a
  export VITE_SEED_NAME="${XC_NAME:-Minha lista}" VITE_SEED_HOST="$XC_HOST" VITE_SEED_USER="$XC_USER" VITE_SEED_PASS="$XC_PASS" VITE_SEED_TMDB="${TMDB_KEY:-}"
fi
[ "$REPORT" = 1 ] && export VITE_REPORT_URL="http://$MAC_IP:8787/report?f=nyx"
[ -n "${UPDATE_URL:-}" ] && export VITE_UPDATE_URL="$UPDATE_URL"

bun run build >/dev/null
bun scripts/check-compat.ts

rm -rf "$OUT" && mkdir -p "$OUT"
cp -R dist/. "$OUT/"
# versão do pacote da TV = versão do package.json
VERSION="$(bun -e 'console.log(require("./package.json").version)')"
sed "s/ version=\"[0-9.]*\" viewmodes/ version=\"$VERSION\" viewmodes/" tizen/config.xml > "$OUT/config.xml"
echo "versão $VERSION"
python3 -I scripts/make-icon.py "$OUT/icon.png" 512

# o sdb do Mac às vezes trava e recusa a TV mesmo com a porta aberta: reinicia e tenta de novo
connected() { "$SDB" devices | grep -q "^$TARGET"; }
"$SDB" connect "$TV_IP" >/dev/null || true
if ! connected; then
  "$SDB" kill-server >/dev/null 2>&1 || true
  "$SDB" connect "$TV_IP" >/dev/null || true
fi
if ! connected; then
  echo "TV $TV_IP não conectou pelo sdb. Confira na TV: Apps › 12345 › Developer mode On, Host PC IP = $MAC_IP, e reinicie a TV." >&2
  exit 1
fi
"$TIZEN" package -t wgt -s "$PROFILE" -- "$OUT" >/dev/null
# o instalador da TV falha com espaço no nome do .wgt
mv "$OUT"/*.wgt "$OUT/nyx.wgt"
"$TIZEN" install -n nyx.wgt -s "$TARGET" -- "$OUT" | grep -E "install completed|Failed|error" || true

if [ "$DEBUG" = 1 ]; then
  "$SDB" -s "$TARGET" shell 0 debug "$APP_ID"
else
  "$TIZEN" run -p "$APP_ID" -s "$TARGET" | grep -E "launched|Failed" || true
fi
