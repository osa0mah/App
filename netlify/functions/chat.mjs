import { answerMessage, explainEvidence } from "../../server/chatAnswers.mjs";
export async function handler(event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const respond = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data),
  });
  if (event.httpMethod === "OPTIONS") return respond(204, {});
  if (event.httpMethod !== "POST")
    return respond(405, { error: "استخدم إرسال رسالة للمحادثة." });
  if ((event.body || "").length > 12000)
    return respond(413, { error: "الرسالة أطول من الحد المتاح." });
  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return respond(400, { error: "صيغة الرسالة غير صالحة." });
  }
  if (
    typeof input.message !== "string" ||
    !input.message.trim() ||
    input.message.length > 1200
  )
    return respond(400, { error: "اكتب رسالة لا تتجاوز ١٢٠٠ حرف." });
  const history = Array.isArray(input.history)
    ? input.history
        .filter(
          (x) =>
            x &&
            ["user", "assistant"].includes(x.role) &&
            typeof x.content === "string",
        )
        .slice(-6)
        .map((x) => ({ role: x.role, content: x.content.slice(0, 1200) }))
    : [];
  try {
    const answer = await answerMessage(input.message.trim(), history);
    if (answer.evidence) {
      try {
        const explanation = await explainEvidence(
          input.message,
          answer.evidence,
        );
        if (explanation) {
          answer.explanation = explanation;
          answer.mode = "assisted";
        }
      } catch {
        /* Keep the exact retrieved answer when the model is unavailable. */
      }
    }
    delete answer.evidence;
    return respond(200, answer);
  } catch {
    return respond(500, { error: "تعذّر تجهيز الإجابة. حاول مجددًا." });
  }
}
