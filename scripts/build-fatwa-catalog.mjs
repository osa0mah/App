import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectCatalog } from "../server/catalogBuild.mjs";
import {
  readSnapshot,
  mergeSnapshots,
  assertPublishedMinimums,
  writeSnapshot,
  publishedSnapshot,
  refreshKeys,
  MINIMUM_PUBLISHED_COUNTS,
} from "../server/catalogSnapshot.mjs";
export async function buildFatwaCatalog({
  root = process.cwd(),
  production = process.env.NETLIFY === "true",
  force = process.env.FATWA_REFRESH_CATALOG === "true",
  collect = collectCatalog,
  backup = publishedSnapshot,
  minimums = MINIMUM_PUBLISHED_COUNTS,
  now = Date.now(),
} = {}) {
  const output = resolve(root, "generated/fatwa-catalog.json");
  const cache = resolve(root, "catalog-cache/fatwa-catalog.json");
  const candidates = await Promise.all([
    readSnapshot(output),
    readSnapshot(cache),
    production ? backup() : null,
  ]);
  const previous = mergeSnapshots(
    {
      schemaVersion: 1,
      generatedAt: new Date(now).toISOString(),
      sources: [],
      records: [],
    },
    candidates,
  );
  const keys = refreshKeys(previous, { force, now });
  const fresh = await collect({
    deadline: Date.now() + 45000,
    maxPages: 60,
    keys,
  });
  const catalog = mergeSnapshots(fresh, candidates);
  for (const source of catalog.sources)
    console.log(
      `Fatwa catalog ${source.key}: ${source.count} saved titles, ${source.pageCount} pages checked${source.retained ? " (retained previous catalog)" : ""}${source.robots ? ` [robots ${source.robots.code}]` : ""}`,
    );
  if (production) assertPublishedMinimums(catalog, minimums);
  else if (!catalog.records.length)
    console.warn(
      "Development catalog is empty. Production would be blocked to prevent replacing the 277-title baseline.",
    );
  await writeSnapshot(output, catalog);
  if (catalog.records.length) {
    await writeSnapshot(cache, catalog);
    await writeSnapshot(resolve(root, "public/catalog/fatwas.json"), catalog);
  }
  return catalog;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await buildFatwaCatalog();
