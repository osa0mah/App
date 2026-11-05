import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { providers } from "./fatwaSources.mjs";
import { sanitizeSnapshot } from "./catalogSnapshot.mjs";
export const CATALOG_SNAPSHOT_BYTES = 64 * 1024 * 1024;
export async function readSeedSnapshots(root) {
  const directory = resolve(root, "catalog-seeds");
  let manifest;
  try { manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return []; throw Error("INVALID_CATALOG_SEED_MANIFEST"); }
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) throw Error("INVALID_CATALOG_SEED_MANIFEST");
  const seeds = [];
  for (const entry of manifest.files) {
    if (!Object.hasOwn(providers, entry.provider) || entry.file !== `${entry.provider}.json.gz` || !/^[a-f0-9]{64}$/.test(entry.sha256 || ""))
      throw Error("INVALID_CATALOG_SEED_ENTRY");
    const compressed = await readFile(resolve(directory, entry.file));
    if (compressed.length > 20 * 1024 * 1024 || createHash("sha256").update(compressed).digest("hex") !== entry.sha256)
      throw Error("CATALOG_SEED_CHECKSUM_FAILED");
    const catalog = sanitizeSnapshot(JSON.parse(gunzipSync(compressed, { maxOutputLength: CATALOG_SNAPSHOT_BYTES }).toString("utf8")));
    if (catalog.records.length !== entry.records || !catalog.records.every(row => row.provider === entry.provider))
      throw Error("CATALOG_SEED_RECORDS_INVALID");
    seeds.push(catalog);
  }
  return seeds;
}
