import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createPreviewServer } from "../server/local-preview.mjs";
const listen = server => new Promise(ok => server.listen(0, "127.0.0.1", ok));
const close = server => new Promise(ok => { server.closeAllConnections(); server.close(ok); });
test("local preview serves API responses, bounds bodies, blocks other origins, and relays Metro HTTP/WebSocket", async () => {
  const upstream = http.createServer((req,res) => { res.writeHead(200,{"Content-Type":"text/html"});res.end(`development:${req.url}`); });
  upstream.on("upgrade", (req,socket) => {
    const key = createHash("sha1").update(req.headers["sec-websocket-key"]+"258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${key}\r\n\r\n`);
    socket.on("data", data => { if ((data[0]&15)===8) socket.end(Buffer.from([136,0])); });
  });
  await listen(upstream);
  const calls=[];
  const handle = async event => { calls.push(event);return {statusCode:200,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"},body:JSON.stringify(event)}; };
  const preview=createPreviewServer({metroPort:upstream.address().port,handlers:{fatwas:handle,chat:handle,hadiths:handle}});
  await listen(preview);const origin=`http://127.0.0.1:${preview.address().port}`;
  try {
    assert.equal(await (await fetch(origin+"/?section=reader")).text(),"development:/?section=reader");
    const api=await fetch(origin+"/api/fatwas?scholar=binbaz&q="+encodeURIComponent("صلاة الوتر"));
    assert.equal(api.headers.get("access-control-allow-origin"),null);
    assert.equal((await api.json()).queryStringParameters.q,"صلاة الوتر");
    const body=JSON.stringify({message:"فسّر سورة الإخلاص"});
    const chat=await fetch(origin+"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body});
    assert.equal((await chat.json()).body,body);
    assert.equal((await fetch(origin+"/api/chat",{method:"POST",body:"x".repeat(48001)})).status,413);
    assert.equal((await fetch(origin+"/api/chat",{method:"POST",headers:{Origin:"https://evil.example"},body:"{}"})).status,403);
    assert.equal((await fetch(origin+"/api/unknown")).status,404);
    const hadiths=await fetch(origin+"/api/hadiths?q="+encodeURIComponent("النيات"));
    assert.equal((await hadiths.json()).queryStringParameters.q,"النيات");
    assert.equal(calls.length,3);
    await new Promise((ok,fail)=>{
      const socket=new WebSocket(origin.replace("http:","ws:")+"/hot");
      const timer=setTimeout(()=>fail(Error("HMR websocket handshake timed out")),3000);
      socket.addEventListener("open",()=>socket.close());
      socket.addEventListener("close",()=>{clearTimeout(timer);ok();});
      socket.addEventListener("error",()=>{clearTimeout(timer);fail(Error("HMR websocket failed"));});
    });
  } finally {await close(preview);await close(upstream);}
});
test("the development branch is explicitly skipped by Netlify's deployment ignore command", async () => {
  const run=promisify(execFile);
  await run(process.execPath,["scripts/skip-preview-deploy.mjs"],{env:{...process.env,BRANCH:"preview"}});
  await assert.rejects(run(process.execPath,["scripts/skip-preview-deploy.mjs"],{env:{...process.env,BRANCH:"main"}}),error=>error.code===1);
});
