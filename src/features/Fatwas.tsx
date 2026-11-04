import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { scholars } from "../content";
import { fatwas, searchFatwas, Fatwa } from "./fatwaIndex";
import { f } from "./featureStyles";
type Result = Pick<Fatwa, "id" | "title" | "sourceUrl" | "scholar">;
const ids = ["binbaz", "alfawzan", "ibnothaimeen"];
const base =
  Platform.OS === "web"
    ? ""
    : process.env.EXPO_PUBLIC_CONTENT_API_URL ||
      "https://joyful-kangaroo-2ad9b7.netlify.app";
async function getContent(params: Record<string, string>, signal: AbortSignal) {
  const response = await fetch(
    `${base}/api/fatwas?${new URLSearchParams(params)}`,
    { signal },
  );
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json"))
    throw Error(
      "خدمة الفتاوى لم تصبح متاحة بعد. انتظر اكتمال نشر التحديث ثم أعد المحاولة.",
    );
  const body = await response.json();
  if (!response.ok) throw Error(body.error || "تعذّر جلب المحتوى من المصدر.");
  return body;
}
export default function Fatwas() {
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Fatwa | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const scholar = scholars[index].name;
  useEffect(
    () => () => {
      const current=request.current;
      request.current=null;
      current?.abort();
    },
    [],
  );
  const run = async (action: "search" | "read", path = "") => {
    if (
      action === "search" &&
      (query.trim().length < 2 || query.length > 120)
    ) {
      setError("اكتب موضوعًا بين حرفين و١٢٠ حرفًا.");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 26000);
    setLoading(true);
    setError("");
    if (action === "search") {
      setSelected(null);
      setResults([]);
      setSearched(true);
    }
    try {
      if (action === "search") {
        const local = searchFatwas(fatwas, scholar, query);
        if (local.length) {
          if (request.current === controller) setResults(local);
          return;
        }
      }
      const body = await getContent(
        {
          action,
          scholar: ids[index],
          ...(action === "search" ? { q: query.trim() } : { path }),
        },
        controller.signal,
      );
      if (controller.signal.aborted || request.current !== controller) return;
      if (action === "search") {
        if (!Array.isArray(body.results))
          throw Error("لم تصل نتائج صالحة من المصدر.");
        setResults(body.results);
      } else {
        if (
          !body.fatwa ||
          typeof body.fatwa.answer !== "string" ||
          !body.fatwa.answer.trim()
        )
          throw Error("النص غير متاح لهذا الرابط.");
        setSelected(body.fatwa);
      }
    } catch (e) {
      if (request.current !== controller) return;
      setError(
        controller.signal.aborted
          ? "انتهت مهلة الاتصال بالمصدر. أعد المحاولة."
          : e instanceof Error
            ? e.message
            : "تعذّر جلب المصدر. حاول مجددًا.",
      );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) setLoading(false);
    }
  };
  const choose = (value: number) => {
    request.current?.abort();
    request.current = null;
    setIndex(value);
    setSelected(null);
    setResults([]);
    setError("");
    setSearched(false);
    setLoading(false);
  };
  return (
    <>
      <Text style={f.title}>الفتاوى</Text>
      <Text style={f.note}>
        اختر الشيخ وابحث في مصدره الرسمي. نعرض النص الأصلي هنا دون تحويلك إلى
        الموقع، مع ذكر مصدره.
      </Text>
      <View style={f.row}>
        {scholars.map((s, i) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: index === i }}
            key={s.name}
            style={[f.chip, index === i && f.selected]}
            onPress={() => choose(i)}
          >
            <Text style={f.label}>{s.name}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="البحث في الفتاوى"
        placeholder="مثل: صلاة الوتر أو زكاة المال"
        style={f.input}
        maxLength={120}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => void run("search")}
        returnKeyType="search"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: loading }}
        disabled={loading}
        style={f.button}
        onPress={() => void run("search")}
      >
        <Text style={f.buttonText}>
          {loading ? "جارٍ جلب المحتوى…" : `بحث في مصدر ${scholar}`}
        </Text>
      </Pressable>
      {!!error && (
        <Text accessibilityLiveRegion="polite" style={f.error}>
          {error}
        </Text>
      )}
      {selected ? (
        <View style={f.card}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelected(null)}
            style={f.chip}
          >
            <Text style={f.label}>العودة إلى النتائج →</Text>
          </Pressable>
          <Text style={f.title}>{selected.title}</Text>
          <Text style={f.note}>الشيخ {selected.scholar}</Text>
          {!!selected.question && (
            <>
              <Text style={f.title}>السؤال</Text>
              <Text style={f.text}>{selected.question}</Text>
            </>
          )}
          <Text style={f.title}>النص الأصلي من المصدر</Text>
          <Text selectable style={f.text}>
            {selected.answer}
          </Text>
          <Text selectable style={f.source}>
            المصدر: {selected.sourceUrl}
          </Text>
          <Text style={f.source}>تاريخ الجلب: {selected.retrievedAt}</Text>
        </View>
      ) : (
        <>
          {!!results.length && (
            <Text accessibilityLiveRegion="polite" style={f.note}>
              النتائج المعروضة من المصدر: {results.length}
            </Text>
          )}
          {results.map((x) => (
            <Pressable
              accessibilityRole="button"
              key={x.id}
              style={f.card}
              onPress={() => {
                const local = fatwas.find(
                  (f) => f.id === x.id && f.scholar === scholar,
                );
                if (local) setSelected(local);
                else void run("read", x.id);
              }}
            >
              <Text style={f.title}>{x.title}</Text>
              <Text style={f.note}>قراءة النص داخل التطبيق ←</Text>
            </Pressable>
          ))}
          {searched && !loading && !error && !results.length && (
            <Text style={f.note}>
              لم يعرض المصدر نتائج نصية مطابقة. جرّب كلمات أخرى.
            </Text>
          )}
          {!searched && (
            <View style={f.card}>
              <Text style={f.text}>
                اكتب موضوعك واضغط بحث. تعتمد النتائج على توفر البحث النصي في
                موقع الشيخ؛ وقد تكون بعض الصفحات صوتية دون نص.
              </Text>
            </View>
          )}
        </>
      )}
    </>
  );
}
