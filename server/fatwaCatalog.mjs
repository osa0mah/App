import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { providers, SourceError } from "./fatwaSources.mjs";
import {
  relevance,
  searchTopic,
  topicTerms,
  normalizeSearch,
} from "./searchText.mjs";
let memo = null;
let memoStamp = null;
export async function loadCatalog(
  path = resolve(process.cwd(), "generated/fatwa-catalog.json"),
) {
  try {
    const info = await stat(path);
    const key = `${path}:${info.mtimeMs}`;
    if (memoStamp === key) return memo;
    const value = JSON.parse(await readFile(path, "utf8"));
    if (
      value.schemaVersion !== 1 ||
      !Array.isArray(value.records) ||
      !Array.isArray(value.sources)
    )
      throw Error("INVALID_SCHEMA");
    memo = value;
    memoStamp = key;
    return value;
  } catch {
    throw new SourceError(
      "فهرس الفتاوى غير جاهز في هذا النشر. يلزم إكمال بنائه من الصفحات الرسمية.",
      "CATALOG_NOT_READY",
    );
  }
}
export function catalogStatus(catalog, key) {
  const source = catalog.sources.find((s) => s.key === key);
  return {
    count: catalog.records.filter((r) => r.provider === key).length,
    updatedAt: catalog.generatedAt,
    coverage: "partial",
    available: !!source && catalog.records.some((r) => r.provider === key),
  };
}
export function queryCatalog(catalog, key, query) {
  if (!providers[key])
    throw new SourceError("المصدر غير صالح.", "INVALID_PROVIDER");
  if (!catalogStatus(catalog, key).available)
    throw new SourceError(
      "لم نتمكن من بناء فهرس هذا المصدر من صفحاته الرسمية بعد. البحث غير متاح لهذا الشيخ حاليًا.",
      "CATALOG_EMPTY",
    );
  const topic = searchTopic(query);
  if (!topic)
    throw new SourceError(
      "اكتب موضوع الفتوى، مثل صلاة الوتر أو زكاة المال.",
      "QUERY_TOO_BROAD",
    );
  const count = topicTerms(topic).length;
  return catalog.records
    .filter((r) => r.provider === key)
    .map((r) => {
      const hits = relevance(r.title, topic);
      const score =
        hits +
        (hits === count ? 2 : 0) +
        (normalizeSearch(r.title).includes(normalizeSearch(topic)) ? 2 : 0);
      return { r, score, hits };
    })
    .filter((x) => x.hits > 0)
    .sort(
      (a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title, "ar"),
    )
    .slice(0, 30)
    .map((x) => x.r);
}
export async function searchCatalog(provider, query) {
  const key = Object.keys(providers).find(
    (k) => providers[k].name === provider.name,
  );
  return queryCatalog(await loadCatalog(), key, query);
}
