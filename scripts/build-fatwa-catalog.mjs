import { mkdir, writeFile } from "node:fs/promises";
import { collectCatalog } from "../server/catalogBuild.mjs";
const catalog = await collectCatalog({
  deadline: Date.now() + 45000,
  maxPages: 60,
});
await mkdir(new URL("../generated/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../generated/fatwa-catalog.json", import.meta.url),
  JSON.stringify(catalog) + "\n",
);
for (const source of catalog.sources)
  console.log(
    `Fatwa catalog ${source.key}: ${source.count} titles, ${source.pageCount} pages, ${source.coverage}${source.robots ? ` [robots ${source.robots.code}]` : ""}${source.issues.length ? ` (${source.issues.join(", ")})` : ""}`,
  );
if (!catalog.records.length)
  console.warn(
    "No official titles were indexed. The app will report catalog unavailability, not zero matching fatwas.",
  );
