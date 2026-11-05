import test from "node:test";
import assert from "node:assert/strict";
import { readSourceBody } from "../server/sourceBody.mjs";
import { collectCatalog } from "../server/catalogBuild.mjs";
test("large source HTML is indexed beyond the previous two million character limit", async () => {
  const catalog = await collectCatalog({
    keys: ["alfawzan"], maxPages: 1, deadline: Date.now() + 10000,
    fetcher: async (url) => new Response(url.endsWith("/robots.txt")
      ? "User-agent: *\nAllow: /"
      : `<html><head><script>${" ".repeat(2_100_000)}</script></head><body><a href="/ar/node/123">حكم صلاة الوتر</a></body></html>`),
  });
  assert.equal(catalog.records.length, 1);
  assert.equal(catalog.records[0].title, "حكم صلاة الوتر");
});
test("oversized streamed responses are cancelled before reading the remaining chunks", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(10)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(readSourceBody(response, 15), /DOCUMENT_TOO_LARGE/);
  assert.equal(cancelled, true);
});
test("Arabic UTF-8 split across streamed chunks is decoded intact", async () => {
  const encoded = new TextEncoder().encode("الصلاة");
  const response = new Response(new ReadableStream({ start(controller) {
    for (const byte of encoded) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } }));
  assert.equal(await readSourceBody(response), "الصلاة");
});
test("a larger reader retries failed old-limit catalogs without waiting for cooldown", async () => {
  const { refreshKeys } = await import("../server/catalogSnapshot.mjs");
  const now = Date.now();
  const source = { key: "ibnothaimeen", lastAttemptAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), pageFailures: [{ path: "/sitemap.xml", code: "DOCUMENT_TOO_LARGE" }] };
  const catalog = { generatedAt: new Date(now).toISOString(), records: [], sources: [source] };
  assert.ok(refreshKeys(catalog, { now }).includes("ibnothaimeen"));
  source.bodyLimitBytes = (await import("../server/sourceBody.mjs")).SOURCE_PAGE_BYTES;
  assert.ok(!refreshKeys(catalog, { now }).includes("ibnothaimeen"));
});
