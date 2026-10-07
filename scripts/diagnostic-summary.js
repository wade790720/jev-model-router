import { readdir, readFile } from "node:fs/promises";
import { DEFAULT_DIR } from "./diagnostic-collector.js";

const files = (await readdir(DEFAULT_DIR).catch(error => { if (error.code !== "ENOENT") throw error; return []; }))
  .filter(name => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort().slice(-14);
const days = {}, failures = new Map();
let invalidRecords = 0;
for (const file of files) {
  const content = await readFile(new URL(`../.local/diagnostics/${file}`, import.meta.url), "utf8");
  for (const line of content.split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      const day = file.slice(0, 10);
      days[day] ??= {};
      days[day][event.outcome] = (days[day][event.outcome] ?? 0) + 1;
      if (["failure", "partial"].includes(event.outcome)) {
        const key = [event.extensionVersion, event.surface, event.target, event.stage, event.code].join(" / ");
        const group = failures.get(key) ?? { count: 0, latest: event.timestamp };
        group.count++; group.latest = [group.latest, event.timestamp].sort().at(-1); failures.set(key, group);
      }
    } catch { invalidRecords++; }
  }
}
console.log(JSON.stringify({ days, failures: [...failures].map(([signature, details]) => ({ signature, ...details })).sort((a, b) => b.count - a.count), invalidRecords }, null, 2));
