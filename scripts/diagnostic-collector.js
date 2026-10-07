import { createServer } from "node:http";
import { mkdir, appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { sanitizeDiagnostic } from "../extension/diagnostics.js";

export const DEFAULT_DIR = fileURLToPath(new URL("../.local/diagnostics/", import.meta.url));
export function createCollector({ directory = DEFAULT_DIR, now = Date.now } = {}) {
  let queue = Promise.resolve();
  let cachedDay = "", seen = new Set();
  let windowStart = 0, requestCount = 0;
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    const extensionId = request.headers["x-smart-chatgpt-extension"];
    const extensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/.test(origin ?? "");
    const allowed = extensionOrigin || (!origin && /^[a-p]{32}$/.test(extensionId ?? ""));
    const send = (status, body) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(body)); };
    if (origin && !extensionOrigin) { send(403, { error: "Origin denied" }); return; }
    if (extensionOrigin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
    }
    if (request.method === "OPTIONS" && allowed) {
      response.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Smart-ChatGPT-Extension");
      send(200, { ok: true }); return;
    }
    if (request.url === "/api/health" && request.method === "GET") { send(200, { ok: true, service: "smart-chatgpt-diagnostics" }); return; }
    if (request.url !== "/api/diagnostics" || request.method !== "POST") { send(404, { error: "Not found" }); return; }
    if (!allowed || !String(request.headers["content-type"]).startsWith("application/json")) { send(403, { error: "Extension required" }); return; }
    if (now() - windowStart > 60000) { windowStart = now(); requestCount = 0; }
    if (++requestCount > 120) { send(429, { error: "Rate limited" }); return; }
    let size = 0, chunks = [];
    try {
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 65536) { send(413, { error: "Payload too large" }); return; }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!Array.isArray(body.events) || !body.events.length || body.events.length > 40) { send(400, { error: "Invalid batch" }); return; }
      const events = body.events.map(event => {
        if (!/^[0-9a-f-]{36}$/i.test(event.id ?? "") || !Number.isFinite(Date.parse(event.timestamp))) throw new Error("Invalid event");
        return { ...sanitizeDiagnostic(event), id: event.id, timestamp: new Date(event.timestamp).toISOString(), receivedAt: new Date(now()).toISOString() };
      });
      const operation = queue.catch(() => {}).then(async () => {
        const day = new Date(now()).toISOString().slice(0, 10);
        await mkdir(directory, { recursive: true });
        const path = join(directory, `${day}.jsonl`);
        if (cachedDay !== day) {
          const previous = await readFile(path, "utf8").catch(error => { if (error.code !== "ENOENT") throw error; return ""; });
          seen = new Set(previous.split("\n").filter(Boolean).map(line => JSON.parse(line).id)); cachedDay = day;
        }
        const batchIds = new Set();
        const fresh = events.filter(event => {
          if (seen.has(event.id) || batchIds.has(event.id)) return false;
          batchIds.add(event.id); return true;
        });
        if (seen.size + fresh.length > 5000) throw new Error("Daily diagnostic limit");
        if (fresh.length) await appendFile(path, fresh.map(event => JSON.stringify(event)).join("\n") + "\n", { mode: 0o600 });
        for (const event of fresh) seen.add(event.id);
        return events.map(event => event.id);
      });
      queue = operation;
      send(200, { acceptedIds: await operation });
    } catch { send(400, { error: "Diagnostic not accepted" }); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createCollector();
  server.requestTimeout = 5000;
  server.listen(43127, "127.0.0.1", () => console.log("Smart ChatGPT diagnostics listening on 127.0.0.1:43127"));
  server.on("error", error => { console.error(error.code ?? "Collector error"); process.exitCode = 1; });
}
