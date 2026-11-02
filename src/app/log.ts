// Logs da TV no Mac: com VITE_REPORT_URL (./scripts/tv.sh --report), erros e console.warn/error
// vão para tools/report-server.ts. Sem a variável, não faz nada.
const url = import.meta.env.VITE_REPORT_URL;

function send(level: string, args: unknown[]) {
  if (!url) return;
  const msg = args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : safeJson(a))).join(' ');
  try {
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ level, msg, at: new Date().toISOString() }) }).catch(() => undefined);
  } catch {
    // sem rede: ignora
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function installRemoteLog() {
  if (!url) return;
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...a: unknown[]) => (orig.log(...a), send('log', a));
  console.warn = (...a: unknown[]) => (orig.warn(...a), send('warn', a));
  console.error = (...a: unknown[]) => (orig.error(...a), send('error', a));
  window.addEventListener('error', (e) => send('error', [e.message, `${e.filename}:${e.lineno}`]));
  window.addEventListener('unhandledrejection', (e) => send('error', ['unhandledrejection', e.reason]));
  send('log', ['boot', navigator.userAgent]);
}
