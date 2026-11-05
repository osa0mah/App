import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readSeedSnapshots } from "../server/catalogSeeds.mjs";
import { buildFatwaCatalog } from "../scripts/build-fatwa-catalog.mjs";
import { readSnapshot } from "../server/catalogSnapshot.mjs";
const date = "2026-11-05T00:00:00.000Z";
const catalog = { schemaVersion: 1, generatedAt: date, sources: [{ key: "binbaz", pageCount: 1, issues: [] }], records: [{ provider: "binbaz", id: "/fatwas/1/test", sourceUrl: "https://binbaz.org.sa/fatwas/1/test", title: "عنوان اختبار الفتوى", answer: "must not be saved" }] };
async function seed(root, entry = {}) {
  const dir = join(root, "catalog-seeds"); await mkdir(dir, { recursive: true });
  const compressed = gzipSync(JSON.stringify(catalog));
  await writeFile(join(dir, "binbaz.json.gz"), compressed);
  await writeFile(join(dir, "manifest.json"), JSON.stringify({ schemaVersion: 1, files: [{ provider: "binbaz", file: "binbaz.json.gz", records: 1, sha256: createHash("sha256").update(compressed).digest("hex"), ...entry }] }));
}
test("validated compressed official metadata seeds survive a failed source refresh in the actual build", async () => {
  const root = await mkdtemp(join(tmpdir(), "athar-seed-"));
  try {
    await seed(root);
    const [loaded] = await readSeedSnapshots(root);
    assert.equal(loaded.records.length, 1);
    assert.ok(!JSON.stringify(loaded).includes("must not be saved"));
    const built = await buildFatwaCatalog({ root, production: true, force: true, minimums: { binbaz: 1 }, backup: async () => null,
      collect: async (options) => {
        assert.equal(options.listingOnly, true);
        return { schemaVersion: 1, generatedAt: date, sources: [{ key: "binbaz", issues: ["ROBOTS_UNAVAILABLE"] }], records: [] };
      } });
    assert.equal(built.records.length, 1);
    assert.equal((await readSnapshot(join(root, "generated/fatwa-catalog.json"))).records.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("corrupted seed checksums and unsafe paths fail before replacing outputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "athar-bad-seed-"));
  try {
    await seed(root, { sha256: "0".repeat(64) });
    await assert.rejects(readSeedSnapshots(root), /CHECKSUM_FAILED/);
    await seed(root, { file: "../private.json.gz" });
    await assert.rejects(readSeedSnapshots(root), /INVALID_CATALOG_SEED_ENTRY/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
