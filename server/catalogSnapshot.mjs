import { readFile, mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { validateArchiveAudio } from "./archiveAudio.mjs";
import { providers } from "./fatwaSources.mjs";
import { readSourceBody, SOURCE_PAGE_BYTES, SOURCE_SITEMAP_BYTES } from "./sourceBody.mjs";
export const MINIMUM_PUBLISHED_COUNTS = Object.freeze({ binbaz: 277 });
export function sanitizeSnapshot(value) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.records) ||
    !Array.isArray(value.sources) ||
    typeof value.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.generatedAt))
  )
    throw Error("INVALID_CATALOG_SNAPSHOT");
  const records = new Map();
  for (const row of value.records) {
    if (
      !row ||
      !Object.hasOwn(providers, row.provider) ||
      typeof row.title !== "string" ||
      row.title.trim().length < 5 ||
      row.title.length > 220 ||
      typeof row.id !== "string" ||
      typeof row.sourceUrl !== "string"
    )
      continue;
    const p = providers[row.provider];
    let url;
    try {
      url = new URL(row.sourceUrl);
    } catch {
      continue;
    }
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !p.hosts.includes(url.hostname) ||
      !p.path.test(url.pathname) ||
      row.id !== url.pathname
    )
      continue;
    const archive = validateArchiveAudio(row);
    if (row.contentKind === "archived-audio" && !archive) continue;
    if (row.provider === "alfawzan" && /[.]mp3$/i.test(url.pathname) && !archive) continue;
    records.set(`${row.provider}:${row.id}`, {
      ...(archive || {}),
      provider: row.provider,
      id: row.id,
      title: row.title.trim(),
      sourceUrl: url.href,
      scholar: p.name,
      titleOrigin: ["heading", "sitemap", "archive"].includes(row.titleOrigin) ? row.titleOrigin : "link",
    });
  }
  const safeRecords = [...records.values()];
  const sources = Object.entries(providers).flatMap(([key, p]) => {
    const source = value.sources.find((x) => x?.key === key);
    if (!source) return [];
    const count = safeRecords.filter((r) => r.provider === key).length;
    const validDate = (x) =>
      typeof x === "string" && Number.isFinite(Date.parse(x))
        ? new Date(x).toISOString()
        : null;
    const item = {
      key,
      source: p.name,
      count,
      pageCount:
        Number.isInteger(source.pageCount) && source.pageCount >= 0
          ? source.pageCount
          : 0,
      coverage: count ? "partial" : "unavailable",
      issues: Array.isArray(source.issues)
        ? source.issues.filter(
            (x) => typeof x === "string" && /^[A-Z0-9_]{1,70}$/.test(x),
          )
        : [],
      bodyLimitBytes: Number.isSafeInteger(source.bodyLimitBytes) && source.bodyLimitBytes > 0
        ? source.bodyLimitBytes : 0,
      sitemapLimitBytes: Number.isSafeInteger(source.sitemapLimitBytes) && source.sitemapLimitBytes > 0 ? source.sitemapLimitBytes : 0,
      pendingPaths: key === "binbaz" && Array.isArray(source.pendingPaths)
        ? [...new Set(source.pendingPaths.filter(path => typeof path === "string" && /^\/fatwas\/kind\/[1-4](?:\?page=[1-9][0-9]{0,4})?$/.test(path)))].slice(0, 4000) : [],
      retained: !!source.retained,
      updatedAt: validDate(source.updatedAt) || value.generatedAt,
      lastAttemptAt:
        source.lastAttemptAt === null
          ? null
          : validDate(source.lastAttemptAt) || value.generatedAt,
    };
    item.pageFailures = Array.isArray(source.pageFailures)
      ? source.pageFailures.slice(0, 3).flatMap((failure) => {
          if (!failure || typeof failure.path !== "string" ||
              !/^\/[^?#\s]{0,179}$/.test(failure.path) ||
              typeof failure.code !== "string" ||
              !/^[A-Z0-9_]{1,70}$/.test(failure.code)) return [];
          const safe = { path: failure.path, code: failure.code };
          if (typeof failure.detail === "string" && /^[A-Z0-9_]{1,70}$/.test(failure.detail))
            safe.detail = failure.detail;
          if (typeof failure.redirectHost === "string" && /^[a-z0-9.-]{1,253}$/i.test(failure.redirectHost))
            safe.redirectHost = failure.redirectHost;
          return [safe];
        }) : [];
    const robot = source.robots;
    if (
      robot &&
      ["ready", "missing", "failed"].includes(robot.state) &&
      typeof robot.code === "string" &&
      /^[A-Z0-9_]{1,70}$/.test(robot.code)
    ) {
      item.robots = { state: robot.state, code: robot.code };
      if (
        typeof robot.detail === "string" &&
        /^[A-Z0-9_]{1,70}$/.test(robot.detail)
      )
        item.robots.detail = robot.detail;
      if (
        Number.isInteger(robot.attempts) &&
        robot.attempts >= 0 &&
        robot.attempts <= 2
      )
        item.robots.attempts = robot.attempts;
      if (
        typeof robot.redirectHost === "string" &&
        /^[a-z0-9.-]{1,253}$/i.test(robot.redirectHost)
      )
        item.robots.redirectHost = robot.redirectHost;
      if (
        Number.isFinite(robot.retryAfterSeconds) &&
        robot.retryAfterSeconds >= 0 &&
        robot.retryAfterSeconds <= 86400
      )
        item.robots.retryAfterSeconds = robot.retryAfterSeconds;
    }
    return [item];
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date(value.generatedAt).toISOString(),
    coverage: "partial",
    sources,
    records: safeRecords,
  };
}
export async function readSnapshot(file) {
  try {
    return sanitizeSnapshot(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return null;
  }
}
export function mergeSnapshots(fresh, previous = []) {
  const current = sanitizeSnapshot(fresh);
  const old = previous
    .filter(Boolean)
    .map(sanitizeSnapshot)
    .sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt));
  const rows = new Map();
  for (const catalog of [...old, current])
    for (const row of catalog.records)
      rows.set(`${row.provider}:${row.id}`, row);
  const sources = Object.entries(providers).map(([key, p]) => {
    const attempt = current.sources.find((s) => s.key === key);
    const added = current.records.filter((r) => r.provider === key).length;
    const newest = [...old].reverse();
    const dataPrior = newest.find((c) =>
      c.records.some((r) => r.provider === key),
    );
    const latestPrior = newest.find((c) =>
      c.sources.some((s) => s.key === key),
    );
    const dataStatus = dataPrior?.sources.find((s) => s.key === key);
    const priorStatus = latestPrior?.sources.find((s) => s.key === key);
    const count = [...rows.values()].filter((r) => r.provider === key).length;
    if (!attempt) {
      const previousFailed =
        count > 0 &&
        latestPrior &&
        !latestPrior.records.some((r) => r.provider === key);
      return {
        ...priorStatus,
        pageCount: priorStatus?.pageCount ?? 0,
        issues: priorStatus?.issues || [],
        key,
        source: p.name,
        count,
        coverage: count ? "partial" : "unavailable",
        retained: !!priorStatus?.retained || !!previousFailed,
        updatedAt:
          dataStatus?.updatedAt ||
          dataPrior?.generatedAt ||
          priorStatus?.updatedAt ||
          latestPrior?.generatedAt ||
          current.generatedAt,
        lastAttemptAt:
          priorStatus?.lastAttemptAt || latestPrior?.generatedAt || null,
      };
    }
    const retained = added === 0 && count > 0;
    return {
      ...attempt,
      key,
      source: p.name,
      count,
      coverage: count ? "partial" : "unavailable",
      retained,
      updatedAt: retained
        ? dataStatus?.updatedAt || dataPrior.generatedAt
        : current.generatedAt,
      lastAttemptAt: current.generatedAt,
    };
  });
  return { ...current, sources, records: [...rows.values()] };
}
export function refreshKeys(catalog, { now = Date.now(), force = false } = {}) {
  return Object.keys(providers).filter((key) => {
    if (force) return true;
    const source = catalog.sources.find((s) => s.key === key);
    const count = catalog.records.filter((r) => r.provider === key).length;
    if (!source || source.lastAttemptAt === null) return true;
    if (source.bodyLimitBytes !== SOURCE_PAGE_BYTES && source.pageFailures?.some((failure) => failure.code === "DOCUMENT_TOO_LARGE"))
      return true;
    if (key === "ibnothaimeen" && source.sitemapLimitBytes !== SOURCE_SITEMAP_BYTES) return true;
    if (key === "binbaz" && source.pendingPaths?.length && now - Date.parse(source.lastAttemptAt || catalog.generatedAt) >= 60 * 60 * 1000) return true;
    const dataAge = now - Date.parse(source.updatedAt || catalog.generatedAt);
    if (count > 0 && dataAge >= 0 && dataAge < 24 * 60 * 60 * 1000)
      return false;
    const failed = source.retained || count === 0;
    const attemptAge =
      now - Date.parse(source.lastAttemptAt || catalog.generatedAt);
    if (failed && attemptAge >= 0 && attemptAge < 60 * 60 * 1000) return false;
    return true;
  });
}
export function assertPublishedMinimums(
  catalog,
  minimums = MINIMUM_PUBLISHED_COUNTS,
) {
  for (const [key, minimum] of Object.entries(minimums)) {
    const count = catalog.records.filter((r) => r.provider === key).length;
    if (count < minimum)
      throw Error(
        `CATALOG_REGRESSION: ${key} has ${count} titles; at least ${minimum} previously worked. Keeping the current production deploy is safer than publishing a smaller catalog.`,
      );
  }
}
export async function writeSnapshot(file, catalog) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(catalog) + "\n");
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export async function publishedSnapshot({
  origin = "https://joyful-kangaroo-2ad9b7.netlify.app",
  fetcher = fetch,
} = {}) {
  try {
    const base = new URL(origin);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      base.port ||
      base.hostname !== "joyful-kangaroo-2ad9b7.netlify.app"
    )
      return null;
    const response = await fetcher(new URL("/catalog/fatwas.json", base).href, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });
    if (
      !response.ok ||
      !(response.headers.get("content-type") || "").includes("application/json")
    )
      return null;
    const body = await readSourceBody(response, 64 * 1024 * 1024);
    return sanitizeSnapshot(JSON.parse(body));
  } catch {
    return null;
  }
}
