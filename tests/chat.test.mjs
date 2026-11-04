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
  const a = await answerMessage("تفسير سورة البقرة");
  assert.match(a.text, /لا أملك نص/);
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
