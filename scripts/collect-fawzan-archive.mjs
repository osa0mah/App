// Explicit maintenance task: never run this crawler during ordinary app deploys.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractArticle, providers } from "../server/fatwaSources.mjs";
import { readSourceBody } from "../server/sourceBody.mjs";
import { readSeedSnapshots } from "../server/catalogSeeds.mjs";
import { validateArchiveAudio } from "../server/archiveAudio.mjs";
const cache = resolve("catalog-cache");
await mkdir(cache, { recursive: true });
const stateFile = resolve(cache, "fawzan-archive-progress.json");
const output = resolve(cache, "fawzan-archive-catalog.json");
const deadline = Date.now() + 8 * 60 * 1000;
let state = { resumeKey: null, pending: [], checked: [], records: [] };
try { state = JSON.parse(await readFile(stateFile, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
const bootstrap = process.argv[2];
if (bootstrap && !state.resumeKey) {
  const rows = JSON.parse(await readFile(resolve(bootstrap), "utf8"));
  state.resumeKey = rows.findLast(row => row.length === 1)?.[0] || null;
  state.checked = rows.filter(row => row.length === 2 && /^\d{14}$/.test(row[0])).map(row => new URL(row[1]).pathname);
}
const seeds = await readSeedSnapshots(process.cwd());
const records = new Map([...seeds.flatMap(seed => seed.records).filter(row => row.provider === "alfawzan"), ...state.records].filter(row => validateArchiveAudio(row)).map(row => [row.id, row]));
const checked = new Set(state.checked);
async function persist() {
  state.checked = [...checked]; state.records = [...records.values()];
  await writeFile(stateFile, JSON.stringify(state));
  if (records.size) await writeFile(output, JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), coverage: "partial", sources: [{ key: "alfawzan", source: providers.alfawzan.name, count: records.size, pageCount: checked.size, issues: ["ARCHIVED_SOURCE"] }], records: [...records.values()] }));
}
async function request(value, method = "GET", timeout = 15000) {
  let url = new URL(value);
  for (let hop = 0; hop < 5; hop++) {
    if (url.protocol !== "https:" || url.hostname !== "web.archive.org" || url.port || url.username || url.password) throw Error("OFFSITE_ARCHIVE");
    const response = await fetch(url, { method, redirect: "manual", signal: AbortSignal.timeout(Math.max(1, Math.min(timeout, deadline - Date.now()))) });
    if ([301,302,303,307,308].includes(response.status)) {
      const next = response.headers.get("location"); await response.body?.cancel(); if (!next) throw Error("INVALID_REDIRECT"); url = new URL(next,url); continue;
    }
    return { response, url: url.href };
  }
  throw Error("REDIRECT_LIMIT");
}
let attempts = 0;
while (Date.now() < deadline && attempts < 200) {
  if (!state.pending.length) {
    if (state.exhausted) break;
    const api = new URL("https://web.archive.org/cdx/search/cdx");
    for (const [key,value] of Object.entries({url:"www.alfawzan.af.org.sa/ar/node/*",output:"json",collapse:"urlkey",fl:"timestamp,original",limit:"20",showResumeKey:"true"})) api.searchParams.set(key,value);
    api.searchParams.append("filter","statuscode:200"); api.searchParams.append("filter","mimetype:text/html");
    if (state.resumeKey) api.searchParams.set("resumeKey",state.resumeKey);
    try {
      const {response} = await request(api,"GET",45000);
      if (!response.ok) { await response.body?.cancel(); throw Error("ARCHIVE_INDEX_UNAVAILABLE"); }
      const rows = JSON.parse(await readSourceBody(response, 2*1024*1024));
      state.pending = rows.filter(row => row.length===2 && /^\d{14}$/.test(row[0]) && /^\/ar\/node\/\d+\/?$/.test(new URL(row[1]).pathname));
      state.resumeKey = rows.findLast(row => row.length===1)?.[0] || null;
      state.exhausted = !state.resumeKey;
      if (!state.pending.length) break;
    } catch { console.log("Archive index unavailable; retaining verified recordings and resume state."); break; }
  }
  const [stamp,original] = state.pending.shift();
  const source = new URL(original);
  if (!providers.alfawzan.hosts.includes(source.hostname) || source.username || source.password || checked.has(source.pathname)) continue;
  attempts++; checked.add(source.pathname);
  try {
    const page = await request(`https://web.archive.org/web/${stamp}id_/${original}`);
    if (!page.response.ok) { await page.response.body?.cancel(); continue; }
    const html = await readSourceBody(page.response, 2*1024*1024);
    source.protocol="https:"; source.port="";
    const article = extractArticle(html,source.href,providers.alfawzan);
    if (!article.audioUrl || article.answer) continue;
    const media = await request(`https://web.archive.org/web/${stamp}id_/${article.audioUrl}`,"HEAD");
    const valid = media.response.ok && /^audio\//i.test(media.response.headers.get("content-type") || "");
    await media.response.body?.cancel();
    if (!valid) continue;
    const row = {provider:"alfawzan",id:source.pathname,sourceUrl:source.href,title:article.title,question:article.question,titleOrigin:"archive",contentKind:"archived-audio",archiveUrl:page.url,audioUrl:media.url};
    if (validateArchiveAudio(row)) { records.set(row.id,row); console.log(JSON.stringify({verified:records.size,title:row.title})); }
  } catch { /* A missing or unreadable capture is never an answer. */ }
  finally {
    await persist();
    await new Promise(done=>setTimeout(done,500));
  }
  if (!state.pending.length && !state.resumeKey) break;
}
await persist();
console.log(JSON.stringify({verified:records.size,checked:checked.size,output,pending:state.pending.length,hasResumeKey:!!state.resumeKey}));
