// Import reviewed original-source text; never silently scrape or paraphrase.
import { readFile, writeFile } from "node:fs/promises";
const allowed = new Map([
  ["عبد العزيز بن باز", "binbaz.org.sa"],
  ["صالح الفوزان", "www.alfawzan.af.org.sa"],
  ["محمد بن صالح العثيمين", "binothaimeen.net"],
]);
const file = process.argv[2];
if (!file)
  throw Error("Usage: node scripts/import-fatwas.mjs reviewed-fatwas.json");
const rows = JSON.parse(await readFile(file, "utf8"));
if (!Array.isArray(rows) || !rows.length)
  throw Error("Expected a nonempty array");
const ids = new Set();
for (const r of rows) {
  for (const key of [
    "id",
    "scholar",
    "title",
    "question",
    "answer",
    "sourceUrl",
    "retrievedAt",
  ])
    if (typeof r[key] !== "string" || !r[key].trim())
      throw Error(`Missing ${key}`);
  const url = new URL(r.sourceUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hostname !== allowed.get(r.scholar) ||
    url.pathname === "/"
  )
    throw Error("Each fatwa needs its own official source URL");
  if (
    ids.has(r.id) ||
    /<\/?[a-z][^>]*>/i.test(r.answer) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(r.retrievedAt)
  )
    throw Error("Duplicate ID, HTML, or invalid date");
  ids.add(r.id);
}
await writeFile(
  new URL("../data/fatwas.json", import.meta.url),
  JSON.stringify(rows, null, 2) + "\n",
);
console.log(
  `Imported ${rows.length} reviewed records. Rebuild the preview to include them.`,
);
