// Recebe os logs que o app manda da TV e grava em tools/.reports/<arquivo>.jsonl
import { appendFileSync, mkdirSync } from "node:fs";

const dir = new URL("./.reports/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const port = Number(process.env.REPORT_PORT ?? 8787);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

Bun.serve({
  port,
  hostname: "0.0.0.0",
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/report") {
      const body = await req.text();
      const file = url.searchParams.get("f") ?? "diag";
      appendFileSync(`${dir}${file}.jsonl`, body + "\n");
      console.log(body);
      return new Response("ok", { headers: cors });
    }
    return new Response("not found", { status: 404, headers: cors });
  },
});
console.log(`report-server em http://0.0.0.0:${port}/report`);
