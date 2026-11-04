// Produce a single HTML preview so manual uploads cannot omit JS chunks.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
const source = resolve(process.argv[2] || "dist");
const destination = resolve(process.argv[3] || "/tmp/athar-single-file");
let html = await readFile(resolve(source, "index.html"), "utf8");
const scripts = [
  ...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g),
];
if (!scripts.length) throw new Error("No exported scripts found");
for (const [tag, url] of scripts) {
  const path = resolve(source, "." + url);
  if (relative(source, path).startsWith(".." + sep))
    throw new Error("Invalid script path");
  const js = (await readFile(path, "utf8")).replace(
    /<\/script/gi,
    "<\\/script",
  );
  html = html.replace(tag, () => `<script>${js}</script>`);
}
html = html.replace('<html lang="en">', '<html lang="ar">');
await mkdir(destination, { recursive: true });
await writeFile(resolve(destination, "index.html"), html);
console.log(`Packaged ${scripts.length} scripts into index.html`);
