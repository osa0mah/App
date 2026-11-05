import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import cachePlugin from "../netlify/plugins/fatwa-catalog-cache/index.cjs";
import {
  sanitizeSnapshot,
  mergeSnapshots,
  assertPublishedMinimums,
  writeSnapshot,
  readSnapshot,
  publishedSnapshot,
} from "../server/catalogSnapshot.mjs";
import { queryCatalog, catalogStatus } from "../server/fatwaCatalog.mjs";
const row = (id) => ({
  provider: "binbaz",
  id: `/fatwas/${id}/test`,
  title: `عنوان اختبار صلاة الوتر ${id}`,
  sourceUrl: `https://binbaz.org.sa/fatwas/${id}/test`,
  scholar: "عبد العزيز بن باز",
});
const old = {
  schemaVersion: 1,
  generatedAt: "2026-11-04T20:14:59Z",
  sources: [{ key: "binbaz", count: 2, pageCount: 5, issues: [] }],
  records: [row(1), row(2)],
};
const failure = {
  schemaVersion: 1,
  generatedAt: "2026-11-05T00:00:00Z",
  sources: [
    {
      key: "binbaz",
      count: 0,
      pageCount: 0,
      issues: ["ROBOTS_UNAVAILABLE"],
      robots: { code: "HTTP_403", state: "failed" },
    },
  ],
  records: [],
};
test("a failed refresh retains every previous title and keeps source data dates honest", () => {
  const merged = mergeSnapshots(failure, [old]);
  assert.equal(merged.records.length, 2);
  const status = catalogStatus(merged, "binbaz");
  assert.equal(status.available, true);
  assert.equal(status.updatedAt, old.generatedAt);
  assert.equal(
    Date.parse(status.lastAttemptAt),
    Date.parse(failure.generatedAt),
  );
  assert.equal(status.retained, true);
  assert.match(status.warning, /فهرس محفوظ/);
  assert.equal(queryCatalog(merged, "binbaz", "الوتر").length, 2);
  assertPublishedMinimums(merged, { binbaz: 2 });
});
test("partial refreshes merge new metadata without deleting unvisited titles", () => {
  const fresh = {
    ...failure,
    sources: [
      { key: "binbaz", count: 2, pageCount: 3, issues: ["PARTIAL_CRAWL"] },
    ],
    records: [{ ...row(2), title: "عنوان محدث لصلاة الوتر" }, row(3)],
  };
  const merged = mergeSnapshots(fresh, [old]);
  assert.equal(merged.records.length, 3);
  assert.equal(
    merged.records.find((r) => r.id === row(2).id).title,
    "عنوان محدث لصلاة الوتر",
  );
  assert.equal(catalogStatus(merged, "binbaz").count, 3);
});
test("production minimum prevents publishing an empty or smaller baseline", () => {
  assert.throws(() => assertPublishedMinimums(failure), /CATALOG_REGRESSION/);
  assert.throws(() => assertPublishedMinimums(old), /at least 277/);
  assert.throws(
    () => assertPublishedMinimums(old, { binbaz: 3 }),
    /CATALOG_REGRESSION/,
  );
});
test("backup recovery only accepts expected public metadata on official scholar hosts", () => {
  const corrupt = {
    ...old,
    records: [
      ...old.records,
      { ...row(8), sourceUrl: "https://evil.test/fatwas/8/test" },
      { ...row(9), provider: "__proto__" },
      { ...row(10), sourceUrl: row(10).sourceUrl + "?token=private" },
      { ...row(11), answer: "must-not-be-published" },
    ],
  };
  const safe = sanitizeSnapshot(corrupt);
  assert.equal(safe.records.length, 3);
  assert.ok(!JSON.stringify(safe.records).includes("must-not-be-published"));
  assert.ok(!JSON.stringify(safe.records).includes("evil.test"));
  assert.throws(() => sanitizeSnapshot({ records: [] }), /INVALID_CATALOG/);
});
test("atomic snapshots remain recoverable between builds", async () => {
  const dir = await mkdtemp(join(tmpdir(), "athar-snapshot-"));
  try {
    const file = join(dir, "catalog.json");
    await writeSnapshot(file, old);
    const restored = await readSnapshot(file);
    assert.equal(restored.records.length, 2);
    const merged = mergeSnapshots(failure, [restored]);
    await writeSnapshot(file, merged);
    assert.equal((await readSnapshot(file)).records.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Netlify hooks restore before building and save after a successful build", async () => {
  const calls = [];
  const utils = {
    cache: {
      restore: async (path) => calls.push(["restore", path]),
      save: async (path) => calls.push(["save", path]),
    },
  };
  await cachePlugin.onPreBuild({ utils });
  await cachePlugin.onPostBuild({ utils });
  assert.deepEqual(calls, [
    ["restore", "catalog-cache"],
    ["save", "catalog-cache"],
  ]);
});
test("public backup recovery rejects SPA fallback pages and unrelated destinations", async () => {
  const good = await publishedSnapshot({
    fetcher: async (url, options) => {
      assert.equal(
        url,
        "https://joyful-kangaroo-2ad9b7.netlify.app/catalog/fatwas.json",
      );
      assert.equal(options.redirect, "error");
      return new Response(JSON.stringify(old), {
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.equal(good.records.length, 2);
  const missing = await publishedSnapshot({
    fetcher: async () =>
      new Response("<html>old app</html>", {
        headers: { "Content-Type": "text/html" },
      }),
  });
  assert.equal(missing, null);
  let called = false;
  assert.equal(
    await publishedSnapshot({
      origin: "https://evil.test",
      fetcher: async () => {
        called = true;
      },
    }),
    null,
  );
  assert.equal(called, false);
});

test("UI-only builds reuse recent catalogs without claiming a new crawl", async () => {
  const { refreshKeys } = await import("../server/catalogSnapshot.mjs");
  const now = Date.parse("2026-11-05T00:00:00Z");
  const keys = refreshKeys(old, { now });
  assert.ok(!keys.includes("binbaz"));
  assert.ok(keys.includes("alfawzan"));
  const reused = mergeSnapshots(
    {
      schemaVersion: 1,
      generatedAt: new Date(now).toISOString(),
      sources: [],
      records: [],
    },
    [old],
  );
  assert.equal(reused.records.length, 2);
  assert.equal(catalogStatus(reused, "binbaz").updatedAt, old.generatedAt);
  assert.equal(catalogStatus(reused, "binbaz").lastAttemptAt, old.generatedAt);
  assert.equal(catalogStatus(reused, "binbaz").retained, false);
  assert.deepEqual(refreshKeys(old, { now, force: true }), [
    "binbaz",
    "alfawzan",
    "ibnothaimeen",
  ]);
});
test("failed updates cool down rather than hammering a source on each deploy", async () => {
  const { refreshKeys } = await import("../server/catalogSnapshot.mjs");
  const now = Date.parse(failure.generatedAt) + 30 * 60 * 1000;
  assert.ok(!refreshKeys(failure, { now }).includes("binbaz"));
  assert.ok(
    refreshKeys(failure, { now: now + 60 * 60 * 1000 }).includes("binbaz"),
  );
});

test("a first build never mistakes an empty planning snapshot for a completed refresh", async () => {
  const { refreshKeys } = await import("../server/catalogSnapshot.mjs");
  const now = Date.now();
  const empty = mergeSnapshots(
    {
      schemaVersion: 1,
      generatedAt: new Date(now).toISOString(),
      sources: [],
      records: [],
    },
    [],
  );
  assert.deepEqual(refreshKeys(empty, { now }), [
    "binbaz",
    "alfawzan",
    "ibnothaimeen",
  ]);
});
test("a newer empty file cannot hide an older good backup or relabel old data as freshly indexed", () => {
  const planning = mergeSnapshots(
    {
      schemaVersion: 1,
      generatedAt: "2026-11-05T00:15:00Z",
      sources: [],
      records: [],
    },
    [old, failure],
  );
  const status = catalogStatus(planning, "binbaz");
  assert.equal(planning.records.length, 2);
  assert.equal(status.updatedAt, old.generatedAt);
  assert.equal(
    Date.parse(status.lastAttemptAt),
    Date.parse(failure.generatedAt),
  );
  assert.equal(status.retained, true);
  assert.equal(status.robots.code, "HTTP_403");
});

test("snapshot publication drops unexpected root and source fields, not just answer fields on records", () => {
  const safe = sanitizeSnapshot({
    ...old,
    privateToken: "private-fixture",
    sources: [
      {
        ...old.sources[0],
        cookies: "private-fixture",
        robots: {
          state: "failed",
          code: "HTTP_403",
          rawHeaders: "private-fixture",
        },
      },
    ],
  });
  assert.ok(!JSON.stringify(safe).includes("private-fixture"));
  assert.equal(safe.sources[0].robots.code, "HTTP_403");
});
test("the real build pipeline retains backup data on a failed refresh and writes recoverable snapshots", async () => {
  const { buildFatwaCatalog } =
    await import("../scripts/build-fatwa-catalog.mjs");
  const dir = await mkdtemp(join(tmpdir(), "athar-build-"));
  try {
    await writeSnapshot(join(dir, "catalog-cache/fatwa-catalog.json"), old);
    const result = await buildFatwaCatalog({
      root: dir,
      production: true,
      force: true,
      backup: async () => null,
      minimums: { binbaz: 2 },
      now: Date.parse(failure.generatedAt),
      collect: async () => failure,
    });
    assert.equal(result.records.length, 2);
    assert.equal(
      (await readSnapshot(join(dir, "generated/fatwa-catalog.json"))).records
        .length,
      2,
    );
    assert.equal(
      (await readSnapshot(join(dir, "public/catalog/fatwas.json"))).records
        .length,
      2,
    );
    assert.equal(
      (await readSnapshot(join(dir, "catalog-cache/fatwa-catalog.json")))
        .records.length,
      2,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("a failed production bootstrap stops before overwriting any output", async () => {
  const { buildFatwaCatalog } =
    await import("../scripts/build-fatwa-catalog.mjs");
  const dir = await mkdtemp(join(tmpdir(), "athar-build-gate-"));
  try {
    await assert.rejects(
      buildFatwaCatalog({
        root: dir,
        production: true,
        backup: async () => null,
        collect: async () => failure,
        minimums: { binbaz: 2 },
      }),
      /CATALOG_REGRESSION/,
    );
    assert.equal(
      await readSnapshot(join(dir, "generated/fatwa-catalog.json")),
      null,
    );
    assert.equal(
      await readSnapshot(join(dir, "public/catalog/fatwas.json")),
      null,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("public page diagnostics exclude query strings, raw errors, and extra fields", () => {
  const safe = sanitizeSnapshot({
    ...old,
    sources: [{
      key: "binbaz",
      pageFailures: [
        { path: "/", code: "TIMEOUT", error: "private value", headers: { cookie: "secret" } },
        { path: "/?token=secret", code: "HTTP_403" },
        { path: "/fatwas", code: "TLS_VERIFICATION_FAILED", detail: "CERT_HAS_EXPIRED" },
      ],
    }],
  });
  assert.deepEqual(safe.sources[0].pageFailures, [
    { path: "/", code: "TIMEOUT" },
    { path: "/fatwas", code: "TLS_VERIFICATION_FAILED", detail: "CERT_HAS_EXPIRED" },
  ]);
  assert.ok(!JSON.stringify(safe).includes("secret"));
});
