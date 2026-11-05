import test from "node:test";
import assert from "node:assert/strict";
import { answerMessage, explainEvidence } from "../server/chatAnswers.mjs";
import { handler } from "../netlify/functions/chat.mjs";
test("chat answers the requested verse directly with its source and an optional section", async () => {
  const a = await answerMessage("فسّر الآية الثانية من الفاتحة");
  assert.match(a.text, /تفسير السعدي/);
  assert.match(a.text, /صفات الكمال/);
  assert.equal(a.suggestion.section, "تعلّم");
  assert.equal(a.suggestion.chapter, 1);
  assert.ok(a.source.url);
  assert.ok(a.evidence);
});
test("Arabic digit verse references and follow-up chapter context are preserved", async () => {
  const a = await answerMessage("فسّر الآية ٣", [
    { role: "user", content: "أريد تفسير الفاتحة" },
  ]);
  assert.match(a.text, /الآية 3/);
  assert.doesNotMatch(a.text, /الآية 1\n/);
});
test("unavailable surahs and causes of revelation do not invent source material", async () => {
  const a = await answerMessage("تفسير سورة غير موجودة");
  assert.match(a.text, /لم أتعرف/);
  assert.equal(a.evidence, undefined);
  const b = await answerMessage("ما سبب نزول الإخلاص");
  assert.match(b.text, /لا تتوفر/);
  assert.equal(b.evidence, undefined);
});
test("fatwa conversation quotes retrieved text and stays with the requested scholar", async () => {
  let selected = "";
  let query = "";
  const a = await answerMessage(
    "ابن باز",
    [{ role: "user", content: "أريد فتوى عن صلاة الوتر" }],
    {
      search: async (p, q) => {
        selected = p.name;
        query = q;
        return [{ id: "/fatwas/1", title: "صلاة الوتر", snippet: "" }];
      },
      read: async (p) => ({
        title: "صلاة الوتر",
        scholar: p.name,
        answer: "نص اختبار فقط وليس فتوى حقيقية.",
        sourceUrl: "https://binbaz.org.sa/fatwas/1",
      }),
    },
  );
  assert.equal(selected, "عبد العزيز بن باز");
  assert.match(query, /وتر/);
  assert.match(a.text, /نص اختبار فقط/);
  assert.equal(a.suggestion.scholar, "binbaz");
  assert.equal(a.suggestion.section, "الفتاوى");
});
test("a failed source is never represented as a religious answer", async () => {
  const a = await answerMessage("فتوى ابن باز عن الصلاة", [], {
    search: async () => {
      throw Error("تعذّر المصدر");
    },
  });
  assert.match(a.text, /لم أتمكن/);
  assert.equal(a.evidence, undefined);
});
test("unrelated search results do not become chatbot answers", async () => {
  let read = false;
  const a = await answerMessage("فتوى ابن باز عن الزكاة", [], {
    search: async () => [{ id: "/fatwas/1", title: "حكم السفر", snippet: "" }],
    read: async () => {
      read = true;
    },
  });
  assert.equal(read, false);
  assert.match(a.text, /لم أتحقق/);
});
test("model explanations are optional and preserve the quote as separate evidence", async () => {
  const absent = await explainEvidence("سؤال", "نص", { key: "" });
  assert.equal(absent, null);
  const explanation = await explainEvidence("سؤال", "نص", {
    key: "fixture-not-a-real-key",
    fetcher: async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(JSON.parse(init.body).store, false);
      return new Response(
        JSON.stringify({
          output: [{ content: [{ type: "output_text", text: "شرح اختباري" }] }],
        }),
        { status: 200 },
      );
    },
  });
  assert.equal(explanation, "شرح اختباري");
});
test("chat endpoint validates input and returns an answer without credentials", async () => {
  assert.equal(
    (await handler({ httpMethod: "POST", body: "invalid" })).statusCode,
    400,
  );
  assert.equal(
    (
      await handler({
        httpMethod: "POST",
        body: JSON.stringify({ message: "x".repeat(1201) }),
      })
    ).statusCode,
    400,
  );
  const r = await handler({
    httpMethod: "POST",
    body: JSON.stringify({ message: "كيف أبدأ التسميع؟" }),
  });
  assert.equal(r.statusCode, 200);
  const answer = JSON.parse(r.body);
  assert.match(answer.text, /الميكروفون/);
  assert.equal(answer.suggestion.section, "التسميع");
  assert.equal(answer.evidence, undefined);
});

test("a zero verse number is rejected instead of returning the whole chapter", async () => {
  const a = await answerMessage("تفسير الآية ٠ من الفاتحة");
  assert.match(a.text, /ما رقم الآية/);
  assert.equal(a.evidence, undefined);
});
test("changing scholars in a follow-up retains the substantive fatwa topic", async () => {
  let provider = "",
    topic = "";
  await answerMessage(
    "طيب ابن عثيمين",
    [
      { role: "user", content: "أريد فتوى عن صلاة الوتر" },
      { role: "user", content: "ابن باز" },
    ],
    {
      search: async (p, q) => {
        provider = p.name;
        topic = q;
        return [];
      },
    },
  );
  assert.equal(provider, "محمد بن صالح العثيمين");
  assert.equal(topic, "صلاة الوتر");
});

test("archived audio results are offered as recordings without fabricating a written fatwa or model evidence", async () => {
  const archive = "https://web.archive.org/web/20251012120000id_/https://www.alfawzan.af.org.sa/sites/default/files/test.mp3";
  const answer = await answerMessage("فتوى الفوزان عن الطلاق", [], {
    search: async () => [{ id: "/ar/node/123", title: "سؤال عن الطلاق", contentKind: "archived-audio", question: "سؤال اختبار" }],
    read: async () => ({ title: "سؤال عن الطلاق", scholar: "صالح الفوزان", answer: "", audioUrl: archive, archiveUrl: archive, sourceUrl: "https://www.alfawzan.af.org.sa/ar/node/123" }),
  });
  assert.match(answer.text, /تسجيلًا صوتيًا مؤرشفًا/);
  assert.match(answer.text, /لا يتوفر تفريغ نصي موثق/);
  assert.equal(answer.evidence, undefined);
  assert.equal(answer.source.url, archive);
});

test("natural Witr inquiry is not mistaken for tafsir and automatically retrieves multiple scholars", async () => {
  const calls=[];
  const answer=await answerMessage("أبغى استفسر عن صلاة الوتر",[],{
    search:async(p,q)=>{calls.push([p.name,q]);return p.name.includes("الفوزان")?[]:[{id:"/test",title:"صلاة الوتر"}];},
    read:async p=>({title:"صلاة الوتر",scholar:p.name,answer:`نص اختبار موثق المصدر لـ${p.name}، وليس فتوى حقيقية.`,sourceUrl:p.base+"/test"}),
  });
  assert.equal(calls.length,3);
  assert.ok(calls.every(([,query])=>query==="صلاة الوتر"));
  assert.match(answer.text,/في فتاوى ابن باز/);
  assert.match(answer.text,/في فتاوى ابن عثيمين/);
  assert.doesNotMatch(answer.text,/اذكر اسم السورة/);
  assert.equal(answer.sources.filter(source=>source.kind==="fatwa").length,2);
  assert.ok(answer.sources.every(source=>source.suggestion.scholar));
  assert.ok(!answer.sources.some(source=>source.kind==="tafsir"));
});
test("explain a general religious topic does not inherit an old surah as a verse request", async () => {
  let query="";
  await answerMessage("اشرح صلاة الوتر",[{role:"user",content:"تفسير الفاتحة"}],{
    search:async(p,q)=>{query=q;return [];},
  });
  assert.equal(query,"صلاة الوتر");
});
test("an explicit source restricts the answer and a natural-language follow-up retains its topic", async () => {
  const names=[];let query="";
  await answerMessage("طيب ابن عثيمين",[{role:"user",content:"أبغى استفسر عن صلاة الوتر"}],{
    search:async(p,q)=>{names.push(p.name);query=q;return [];},
  });
  assert.deepEqual(names,["محمد بن صالح العثيمين"]);
  assert.equal(query,"صلاة الوتر");
});
test("one failed source does not suppress a verified answer from another scholar", async () => {
  const answer=await answerMessage("أريد أعرف عن صلاة الوتر",[],{
    search:async p=>{if(p.name.includes("باز"))throw Error("source unavailable");return p.name.includes("عثيمين")?[{id:"/test",title:"صلاة الوتر"}]:[];},
    read:async p=>({title:"صلاة الوتر",scholar:p.name,answer:"نص اختبار من المصدر الآخر وليس فتوى حقيقية.",sourceUrl:p.base+"/test"}),
  });
  assert.match(answer.text,/نص اختبار من المصدر الآخر/);
  assert.match(answer.text,/تعذّر جلب نص من ابن باز/);
  assert.equal(answer.sources.length,1);
});
test("topic answers include a real local Quran verse and its exact tafsir only when relevant", async () => {
  const answer=await answerMessage("أبغى أعرف معنى أسماء الله",[],{search:async()=>[]});
  assert.ok(answer.sources.some(source=>source.kind==="tafsir"));
  assert.match(answer.text,/بِسْمِ ٱللَّهِ/);
  assert.match(answer.text,/تفسير السعدي/);
  assert.equal(answer.sources[0].suggestion.chapter,1);
});
test("clarifying questions and greetings do not turn into unnecessary source searches",async()=>{
  let calls=0;const options={search:async()=>{calls++;return [];}};
  const greeting=await answerMessage("السلام عليكم",[],options);
  assert.match(greeting.text,/وعليكم السلام/);
  const question=await answerMessage("عندي سؤال",[{role:"user",content:"صلاة الوتر"}],options);
  assert.match(question.text,/ما الموضوع/);
  assert.equal(calls,0);
});
test("follow-up evidence questions keep the preceding topic instead of asking for a verse",async()=>{
  let query="";
  await answerMessage("وما الدليل؟",[{role:"user",content:"أبغى استفسر عن صلاة الوتر"}],{search:async(p,q)=>{query=q;return [];}});
  assert.equal(query,"صلاة الوتر");
});
test("generic prayer matches do not replace a requested specific prayer",async()=>{
  let reads=0;
  const answer=await answerMessage("صلاة الوتر",[],{search:async()=>[{id:"/test",title:"صلاة الفجر"}],read:async()=>{reads++;}});
  assert.equal(reads,0);
  assert.match(answer.text,/لم أتحقق من ارتباطها/);
});

test("multiple named scholars and conversational comparison words do not pollute the topic",async()=>{
  const names=[];const queries=[];
  await answerMessage("أبغى أقارن بين ابن باز وابن عثيمين في صلاة الوتر",[],{search:async(p,q)=>{names.push(p.name);queries.push(q);return [];}});
  assert.deepEqual(names,["عبد العزيز بن باز","محمد بن صالح العثيمين"]);
  assert.ok(queries.every(query=>query==="صلاة الوتر"));
});
test("a source-only restriction and timing follow-up retain the original natural-language subject",async()=>{
  const history=[{role:"user",content:"أبغى استفسر عن صلاة الوتر"}];let query="";
  await answerMessage("ابن باز فقط",history,{search:async(p,q)=>{query=q;return [];}});
  assert.equal(query,"صلاة الوتر");
  await answerMessage("وما وقتها؟",history,{search:async(p,q)=>{query=q;return [];}});
  assert.match(query,/صلاة الوتر/);assert.match(query,/وقت/);
});
test("a ruling about something descending is not confused with a cause of Quran revelation",async()=>{
  let calls=0;
  const answer=await answerMessage("حكم نزول الدم",[],{search:async()=>{calls++;return [];}});
  assert.equal(calls,3);assert.doesNotMatch(answer.text,/أي سورة|سبب نزول سورة/);
});

test("a follow-up to a comparison retains both explicitly selected scholars",async()=>{
  const names=[];
  await answerMessage("طيب وما وقتها؟",[{role:"user",content:"قارن ابن باز وابن عثيمين في صلاة الوتر"}],{search:async p=>{names.push(p.name);return [];}});
  assert.deepEqual(names,["عبد العزيز بن باز","محمد بن صالح العثيمين"]);
});

const noLearningSearch = { search: async () => { throw Error("Learning must not search fatwas"); } };
test("learning asks for the surah and interprets the next answer as a selection", async () => {
  const question = "ابغى اعرف عن مقاصد العمل";
  const first = await answerMessage(question, [], noLearningSearch);
  assert.match(first.text, /أي سورة تقصد/);
  assert.deepEqual(first.choices.map(c => c.label), ["الفاتحة", "البقرة", "الكهف", "الإخلاص"]);
  const history = [{role:"user",content:question},{role:"assistant",content:first.text}];
  for (const [name,id] of [["الإخلاص",112],["الفاتحه",1],["سورة الاخلاص",112]]) {
    const answer = await answerMessage(name, history, noLearningSearch);
    assert.match(answer.text, /مقاصد سورة/);
    assert.match(answer.text, /من العلم والعمل/);
    assert.equal(answer.suggestion.chapter,id);
    assert.ok(answer.source.url);
  }
  const baqarah = await answerMessage("البقرة", history, noLearningSearch);
  assert.match(baqarah.text, /مقاصد سورة البقرة/);
  assert.equal(baqarah.suggestion.chapter, 2);
});
test("learning recognizes self-contained requests and does not assume a stale chapter",async()=>{
  const answer=await answerMessage("اشرح مقاصد العلم والعمل في سورة الإخلاص",[],noLearningSearch);
  assert.equal(answer.suggestion.chapter,112);
  const history=[{role:"user",content:"تفسير الفاتحة"}];
  assert.match((await answerMessage("مقاصد العمل",history,noLearningSearch)).text,/أي سورة تقصد/);
  assert.equal((await answerMessage("ومقاصدها؟",history,noLearningSearch)).suggestion.chapter,1);
});
test("learning clarification permits acknowledgements, another surah, and a change of topic",async()=>{
  const first=await answerMessage("مقاصد العمل");
  const history=[{role:"user",content:"مقاصد العمل"},{role:"assistant",content:first.text}];
  assert.match((await answerMessage("طيب",history,noLearningSearch)).text,/أي سورة تقصد/);
  const answer=await answerMessage("الإخلاص",history,noLearningSearch);
  const next=await answerMessage("الفاتحة",[{role:"user",content:"الإخلاص"},{role:"assistant",content:answer.text}],noLearningSearch);
  assert.equal(next.suggestion.chapter,1);
  let calls=0;
  await answerMessage("صلاة الوتر",history,{search:async()=>{calls++;return [];}});
  assert.equal(calls,3);
});
