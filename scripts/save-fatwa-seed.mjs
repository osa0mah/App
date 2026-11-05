import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { sanitizeSnapshot } from "../server/catalogSnapshot.mjs";
const input = process.argv[2];
if (!input) throw Error("Usage: node scripts/save-fatwa-seed.mjs /path/to/verified-official-catalog.json");
const catalog = sanitizeSnapshot(JSON.parse(await readFile(resolve(input), "utf8")));
const keys = [...new Set(catalog.records.map(row => row.provider))];
if (keys.length !== 1 || !catalog.records.length || !catalog.sources.some(source => source.key === keys[0]))
  throw Error("A seed must contain one source with verified metadata and source status.");
const provider = keys[0];
const directory = resolve("catalog-seeds");
await mkdir(directory, { recursive: true });
let manifest = { schemaVersion: 1, files: [] };
try { manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const bytes = gzipSync(JSON.stringify(catalog), { level: 9 });
const file = `${provider}.json.gz`;
await writeFile(resolve(directory, file), bytes);
const entry = { provider, file, records: catalog.records.length, retrievedAt: catalog.generatedAt, sha256: createHash("sha256").update(bytes).digest("hex") };
manifest.files = [...manifest.files.filter(item => item.provider !== provider), entry].sort((a, b) => a.provider.localeCompare(b.provider));
await writeFile(resolve(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ ...entry, compressedBytes: bytes.length }));
