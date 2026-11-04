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
  const count = catalog.records.filter((r) => r.provider === key).length;
  const issues = source?.issues || [];
  let reason = null;
  if (!count) {
    if (issues.includes("ROBOTS_DISALLOW"))
      reason = "تعليمات المصدر تمنع الفهرسة الآلية.";
    else if (issues.includes("ROBOTS_UNAVAILABLE"))
      reason =
        "تعذّر الوصول إلى تعليمات الفهرسة لدى المصدر، فتوقفت عملية الجمع.";
    else if (issues.includes("SOURCE_CHALLENGE"))
      reason = "المصدر يطلب تحققًا إضافيًا قبل قراءة الصفحات.";
    else if (issues.includes("SOURCE_ACCESS_DENIED"))
      reason = "المصدر لم يسمح بقراءة الصفحات أثناء الفهرسة.";
    else if (issues.includes("PAGE_UNAVAILABLE"))
      reason = "تعذّرت قراءة صفحات المصدر أثناء بناء الفهرس.";
    else
      reason =
        "لم تُكتشف عناوين قابلة للفهرسة في الصفحات التي تم الوصول إليها.";
  }
  return {
    count,
    updatedAt: catalog.generatedAt,
    coverage: "partial",
    available: !!source && count > 0,
    pageCount: source?.pageCount ?? 0,
    reason,
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
