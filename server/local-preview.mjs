import http from "node:http";
import net from "node:net";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { handler as fatwas } from "../netlify/functions/fatwas.mjs";
import { handler as chat } from "../netlify/functions/chat.mjs";

export function createPreviewServer({ metroPort = 8081, handlers = { fatwas, chat } } = {}) {
  const server = http.createServer(async (req, res) => {
    if (!req.url?.startsWith("/") || req.url.startsWith("//")) { res.writeHead(400); res.end(); return; }
    const url = new URL(req.url, "http://preview.local");
    const host = (req.headers.host || "").split(":")[0];
    if (!["localhost", "127.0.0.1"].includes(host)) { res.writeHead(403); res.end(); return; }
    const json = (status, value) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
    if (url.pathname === "/_preview/health") { json(200, { ready: true }); return; }
    if (url.pathname.startsWith("/api/")) {
      // A local preview must not expose optional server secrets to other websites.
      let allowed = req.headers["sec-fetch-site"] !== "cross-site";
      if (req.headers.origin) {
        try { allowed &&= new URL(req.headers.origin).host === req.headers.host; }
        catch { allowed = false; }
      }
      if (!allowed) { json(403, { error: "طلب من خارج المعاينة المحلية." }); return; }
      const handle = url.pathname === "/api/fatwas" ? handlers.fatwas : url.pathname === "/api/chat" ? handlers.chat : null;
      if (!handle) { json(404, { error: "الخدمة غير موجودة." }); return; }
      try {
        const chunks = []; let bytes = 0;
        for await (const chunk of req.iterator({ destroyOnReturn: false })) {
          bytes += chunk.length;
          if (bytes > 48000) { json(413, { error: "الطلب أطول من الحد المسموح." }); req.resume(); return; }
          chunks.push(chunk);
        }
        const output = await handle({ httpMethod: req.method, queryStringParameters: Object.fromEntries(url.searchParams), body: Buffer.concat(chunks).toString("utf8") });
        const headers = { ...output.headers };
        for (const key of Object.keys(headers)) if (key.toLowerCase().startsWith("access-control-")) delete headers[key];
        res.writeHead(output.statusCode, headers);
        res.end(output.body);
      } catch { if (!res.headersSent) json(500, { error: "تعذّرت خدمة المعاينة المحلية." }); else res.end(); }
      return;
    }
    const upstream = http.request({ hostname: "127.0.0.1", port: metroPort, path: req.url, method: req.method, headers: req.headers }, response => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) { res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "2" }); res.end("تبدأ المعاينة الآن. أعد تحميل الصفحة بعد لحظات."); }
      else res.end();
    });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  });
  // Relay Metro's original WebSocket handshake and frames for Fast Refresh.
  server.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/") || req.url.startsWith("//")) { socket.destroy(); return; }
    const upstream = net.connect(metroPort, "127.0.0.1", () => {
      let headers = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) headers += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
      upstream.write(headers + "\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy()); socket.on("error", () => upstream.destroy());
    socket.on("close", () => upstream.destroy()); upstream.on("close", () => socket.destroy());
  });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.ATHAR_PREVIEW_PORT || 3000);
  const metroPort = Number(process.env.ATHAR_METRO_PORT || 8081);
  const host = process.env.ATHAR_PREVIEW_HOST || "127.0.0.1";
  createPreviewServer({ metroPort }).listen(port, host, () => console.log(`Preview services ready on port ${port}.`));
}
