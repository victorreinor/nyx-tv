#!/usr/bin/env bash
# Empacota, assina, instala e abre o app de diagnóstico na TV.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIZEN="$HOME/tizen-studio/tools/ide/bin/tizen"
SDB="$HOME/tizen-studio/tools/sdb"
TV_IP="${TV_IP:-192.168.15.15}"
TARGET="$TV_IP:26101"
MAC_IP="${MAC_IP:-$(ipconfig getifaddr en0 || ipconfig getifaddr en1)}"
OUT="$ROOT/.build/diag"

set -a; . "$ROOT/.env.local"; set +a

rm -rf "$OUT" && mkdir -p "$OUT"
cp "$ROOT"/tools/diag/{config.xml,index.html,diag.js,worker.js} "$OUT/"
python3 -I "$ROOT/scripts/make-icon.py" "$OUT/icon.png"
cat > "$OUT/config.js" <<EOF
window.DIAG = {
  host: "$XC_HOST",
  user: "$XC_USER",
  pass: "$XC_PASS",
  report: "http://$MAC_IP:8787/report?f=diag",
  only: "${DIAG_ONLY:-}"
};
EOF

"$SDB" connect "$TV_IP" >/dev/null
"$TIZEN" package -t wgt -s iptvtv -- "$OUT"
# o instalador da TV falha com espaço no nome do .wgt
WGT="$(ls "$OUT"/*.wgt | head -1)"
mv "$WGT" "$OUT/app.wgt"
"$TIZEN" install -n app.wgt -s "$TARGET" -- "$OUT"
"$TIZEN" run -p VrxIptvDg1.Diag -s "$TARGET"
