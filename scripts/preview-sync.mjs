import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export async function syncPreview(root, beforeApply = async () => {}) {
  const git = args => exec("git", args, { cwd: root, timeout: 20000, maxBuffer: 1024 * 1024 });
  const branch = async () => (await git(["branch", "--show-current"])).stdout.trim();
  if (await branch() !== "preview") return { blocked: "branch" };
  if ((await git(["status", "--porcelain", "--untracked-files=no"])).stdout.trim()) return { blocked: "local-edits" };
  await git(["fetch", "--quiet", "origin", "preview"]);
  const files = (await git(["diff", "--name-only", "HEAD", "origin/preview"])).stdout.trim();
  if (!files) return { updated: false };
  try { await git(["merge-base", "--is-ancestor", "HEAD", "origin/preview"]); }
  catch { return { blocked: "local-commits" }; }
  if (await branch() !== "preview") return { blocked: "branch" };
  const dependenciesChanged = /(^|\n)package(-lock)?[.]json(\n|$)/.test(files);
  const toolingChanged = /(^|\n)(scripts\/(start-preview|preview-sync)[.]mjs|server\/local-preview[.]mjs)(\n|$)/.test(files);
  const changes = { updated: true, files, dependenciesChanged, toolingChanged };
  await beforeApply(changes);
  await git(["merge", "--ff-only", "origin/preview"]);
  return changes;
}
