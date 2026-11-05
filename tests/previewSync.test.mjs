import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { syncPreview } from "../scripts/preview-sync.mjs";
const run=promisify(execFile);
test("preview follow fast-forwards new changes and protects local edits, commits and other branches",async()=>{
 const root=await mkdtemp(join(tmpdir(),"athar-follow-"));
 const remote=join(root,"remote.git"),producer=join(root,"producer"),client=join(root,"client");
 const git=(cwd,args)=>run("git",args,{cwd});
 async function commit(cwd,text){await writeFile(join(cwd,"screen.txt"),text);await git(cwd,["add","screen.txt"]);await git(cwd,["commit","-qm",text]);}
 async function identity(cwd){await git(cwd,["config","user.email","preview-test@example.invalid"]);await git(cwd,["config","user.name","Preview Test"]);}
 try{
  await git(root,["init","--bare","-b","preview",remote]);
  await git(root,["clone",remote,producer]);await identity(producer);await commit(producer,"first");await git(producer,["push","-qu","origin","preview"]);
  await git(root,["clone","--branch","preview",remote,client]);await identity(client);
  await commit(producer,"second");await git(producer,["push","-q","origin","preview"]);
  assert.equal((await syncPreview(client)).updated,true);
  assert.equal(await readFile(join(client,"screen.txt"),"utf8"),"second");
  await writeFile(join(client,"screen.txt"),"local edits");
  await commit(producer,"third");await git(producer,["push","-q","origin","preview"]);
  assert.equal((await syncPreview(client)).blocked,"local-edits");
  assert.equal(await readFile(join(client,"screen.txt"),"utf8"),"local edits");
  await commit(client,"local commit");
  assert.equal((await syncPreview(client)).blocked,"local-commits");
  await git(client,["switch","-c","main"]);
  assert.equal((await syncPreview(client)).blocked,"branch");
 }finally{await rm(root,{recursive:true,force:true});}
});
