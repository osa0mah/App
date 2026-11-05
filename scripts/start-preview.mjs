import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import net from "node:net";
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
if (Number(process.versions.node.split(".")[0]) < 24) throw Error("Install Node.js 24 LTS from https://nodejs.org/en/download then reopen the preview.");
const follow = process.argv.includes("--follow");
const port = Number(process.env.ATHAR_PREVIEW_PORT || 3000);
const metroPort = Number(process.env.ATHAR_METRO_PORT || 8081);
if (![port, metroPort].every(n => Number.isInteger(n) && n >= 1024 && n <= 65535) || port === metroPort) throw Error("Choose two different ports between 1024 and 65535.");
const children = new Set(); let closing = false; let syncing = false; let timer;
function startNode(args, env = {}) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", detached: process.platform !== "win32", env: { ...process.env, ...env } });
  children.add(child);
  child.on("exit", code => { children.delete(child); if (!closing && !syncing && code) { console.error("Preview process stopped. Check the message above."); void shutdown(code); } });
  return child;
}
async function runNpm(args) {
  await new Promise((ok, fail) => {
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    child.once("error", fail); child.once("exit", code => code === 0 ? ok() : fail(Error("Dependency installation failed.")));
  });
}
async function stopChildren() {
  await Promise.all([...children].map(async child => {
    if (!child.pid) return;
    try {
      if (process.platform === "win32") await exec("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
      else process.kill(-child.pid, "SIGTERM");
    } catch { /* Already stopped. */ }
  }));
  children.clear();
}
async function shutdown(code = 0) {
  if (closing) return; closing = true; clearInterval(timer); await stopChildren(); process.exit(code);
}
process.on("SIGINT", () => void shutdown()); process.on("SIGTERM", () => void shutdown());
process.on("uncaughtException", error => { console.error(error.message); void shutdown(1); });
process.on("unhandledRejection", error => { console.error(error?.message || error); void shutdown(1); });
async function available(value) {
  await new Promise((ok, fail) => {
    const probe = net.createServer(); probe.once("error", fail); probe.listen(value, "127.0.0.1", () => probe.close(ok));
  });
}
async function prepareCatalog() {
  const { buildFatwaCatalog } = await import("./build-fatwa-catalog.mjs");
  await buildFatwaCatalog({ production: true, backup: async () => null, collect: async () => ({ schemaVersion: 1, generatedAt: new Date().toISOString(), sources: [], records: [] }) });
}
function startServices() {
  startNode(["--watch", "--watch-preserve-output", "server/local-preview.mjs"], { ATHAR_PREVIEW_PORT: String(port), ATHAR_METRO_PORT: String(metroPort) });
  startNode(["node_modules/expo/bin/cli", "start", "--web", "--port", String(metroPort), "--localhost"], { BROWSER: "none", EXPO_NO_TELEMETRY: "1" });
}
async function sync() {
  if (syncing || closing) return; syncing = true;
  try {
    const { syncPreview } = await import("./preview-sync.mjs");
    const changes = await syncPreview(root, async change => {
      if (change.dependenciesChanged || change.toolingChanged) await stopChildren();
    });
    if (changes.blocked) { console.log("Auto-update paused to protect your local branch or edits. The preview stays open."); clearInterval(timer); return; }
    if (!changes.updated) return;
    if (changes.dependenciesChanged) await runNpm(["ci", "--include=dev"]);
    if (changes.files.includes("catalog-seeds/")) await prepareCatalog();
    if (changes.dependenciesChanged || changes.toolingChanged) startServices();
    console.log("New project changes received. The browser refreshes automatically.");
  } catch {
    if (!children.size) { console.error("Could not restart after the update. Check the message above and reopen START-PREVIEW.cmd."); await shutdown(1); }
    else console.log("Could not fetch updates now. The local preview is still available; retrying shortly.");
  }
  finally { syncing = false; }
}
await available(port); await available(metroPort);
if (!existsSync(resolve(root, "node_modules/expo/bin/cli"))) await runNpm(["ci", "--include=dev"]);
await prepareCatalog();
startServices();
for (let attempt = 0; attempt < 120; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${metroPort}`, { signal: AbortSignal.timeout(1500) });
    await response.body?.cancel();
    if (response.ok) break;
  } catch { /* Metro is still starting. */ }
  if (attempt === 119) throw Error("Metro did not start. Check its terminal output.");
  await new Promise(done => setTimeout(done, 1000));
}
if (process.argv.includes("--open") && process.platform === "win32") {
  spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `start "" chrome http://localhost:${port}`], { stdio: "ignore", windowsVerbatimArguments: true });
}
console.log(`\nLOCAL PREVIEW — open http://localhost:${port} in Google Chrome on THIS computer.\nNo website is published. Keep this window open; Ctrl+C stops it.\n`);
if (follow) { timer = setInterval(() => void sync(), 10000); void sync(); }
