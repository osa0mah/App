import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const data = JSON.parse(
  await readFile(new URL("../data/tafsir/saadi.json", import.meta.url), "utf8"),
);
test("every available verse has local sourced tafsir with no duplicate keys", () => {
  assert.equal(data.version, "v1.2.1");
  assert.equal(data.ayahs.length, 11);
  assert.equal(new Set(data.ayahs.map((a) => `${a.surah}:${a.ayah}`)).size, 11);
  for (const [chapter, count] of [
    [1, 7],
    [112, 4],
  ])
    for (let verse = 1; verse <= count; verse++) {
      const a = data.ayahs.find((x) => x.surah === chapter && x.ayah === verse);
      assert.ok(a && a.text.length > 20);
    }
  assert.ok(data.upstreamSource.startsWith("https://"));
  assert.ok(data.datasetSource.endsWith("/v1.2.1"));
});
