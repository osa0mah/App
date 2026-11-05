import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View, StyleSheet } from "react-native";
import { contentBase } from "./contentApi";
import { f } from "./featureStyles";
export type ChatSuggestion = {
  section: "القرآن" | "تعلّم" | "الفتاوى" | "القراء" | "التسميع" | "الأحاديث";
  chapter?: number;
  verse?: number;
  scholar?: string;
  query?: string;
  hadithId?: string;
};
export type ChatSource = {
  title: string;
  url: string;
  scholar?: string;
  kind?: "fatwa" | "tafsir" | "hadith";
  actionLabel?: string;
  suggestion?: ChatSuggestion;
};
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  source?: { title: string; url: string };
  sources?: ChatSource[];
  suggestion?: ChatSuggestion | null;
  explanation?: string;
  choices?: { label: string; message: string }[];
};
type Props = {
  messages: ChatMessage[];
  onMessagesChange: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onNavigate: (suggestion: ChatSuggestion) => void;
};
export default function ChatAssistant({
  messages,
  onMessagesChange,
  onNavigate,
}: Props) {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      const current = request.current;
      request.current = null;
      current?.abort();
    },
    [],
  );
  const send = async (value = input) => {
    const text = value.trim();
    if (!text || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 55000);
    setPending(true);
    setInput("");
    onMessagesChange((previous) => [
      ...previous,
      { id: `${Date.now()}-user`, role: "user", text },
    ]);
    try {
      const response = await fetch(`${contentBase}/api/chat`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.text.slice(0, 1200) })),
        }),
      });
      if (
        !(response.headers.get("content-type") || "").includes(
          "application/json",
        )
      )
        throw Error(
          "خدمة المحادثة لم تصبح متاحة بعد. انتظر اكتمال نشر التحديث.",
        );
      const data = await response.json();
      if (!response.ok || typeof data.text !== "string")
        throw Error(data.error || "تعذّر تجهيز الإجابة.");
      if (request.current !== controller) return;
      onMessagesChange((previous) => [
        ...previous,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          text: data.text,
          source: data.source,
          sources: Array.isArray(data.sources) ? data.sources : undefined,
          suggestion: data.suggestion,
          explanation: data.explanation,
          choices: Array.isArray(data.choices) ? data.choices : undefined,
        },
      ]);
    } catch (e) {
      if (request.current !== controller) return;
      onMessagesChange((previous) => [
        ...previous,
        {
          id: `${Date.now()}-error`,
          role: "assistant",
          text: controller.signal.aborted
            ? "تأخر المصدر في الرد. حاول مجددًا بعد قليل."
            : e instanceof Error
              ? e.message
              : "تعذّر الاتصال بالمساعد.",
        },
      ]);
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  };
  return (
    <>
      <Text style={f.title}>محادثتك مع أثر القرآن</Text>
      <Text style={f.note}>
        اسأل هنا لتظهر الإجابة ومصدرها في المحادثة. فتح القسم المرتبط خيار إضافي
        أسفل الإجابة.
      </Text>
      {!messages.length && (
        <View style={f.card}>
          <Text style={f.text}>
            أهلًا بك. اسألني عن الموضوع مباشرة، مثل «أبغى أستفسر عن صلاة الوتر».
            أبحث في فتاوى المشايخ، وأضيف النص المرتبط من القرآن والتفسير إن توفر.
            ويمكنك تحديد شيخ إذا رغبت.
          </Text>
        </View>
      )}
      <View>
        {messages.map((m) => (
          <View
            key={m.id}
            style={[f.card, s.bubble, m.role === "user" ? s.user : s.assistant]}
          >
            <Text style={s.role}>
              {m.role === "user" ? "أنت" : "أثر القرآن"}
            </Text>
            <Text
              selectable
              accessibilityLiveRegion={
                m.role === "assistant" ? "polite" : "none"
              }
              style={f.text}
            >
              {m.text}
            </Text>
            {!!m.choices?.length && <View style={[f.row, { marginTop: 12 }]}>
              {m.choices.map(choice => <Pressable key={choice.message} accessibilityRole="button"
                accessibilityState={{ disabled: pending }} disabled={pending} style={f.chip}
                onPress={() => void send(choice.message)}>
                <Text style={f.label}>{choice.label}</Text>
              </Pressable>)}
            </View>}
            {m.explanation && (
              <View style={s.explanation}>
                <Text style={f.note}>شرح مساعد للنص المنقول</Text>
                <Text selectable style={f.text}>
                  {m.explanation}
                </Text>
              </View>
            )}
            {!!m.sources?.length && m.sources.map((source, index) => (
              <View key={`${source.url}:${index}`} style={s.citation}>
                <Text selectable style={f.source}>المصدر: {source.title}{"\n"}{source.url}</Text>
                {source.suggestion && <Pressable accessibilityRole="button" style={f.chip}
                  onPress={() => onNavigate(source.suggestion!)}>
                  <Text style={f.label}>{source.actionLabel || `فتح قسم ${source.suggestion.section}`} ←</Text>
                </Pressable>}
              </View>
            ))}
            {!m.sources?.length && m.source && (
              <Text selectable style={f.source}>
                المصدر: {m.source.title}
                {"\n"}
                {m.source.url}
              </Text>
            )}
            {!m.sources?.length && m.suggestion && (
              <Pressable
                accessibilityRole="button"
                style={[f.chip, { marginTop: 16 }]}
                onPress={() => onNavigate(m.suggestion!)}
              >
                <Text style={f.label}>فتح قسم {m.suggestion.section} ←</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>
      {pending && (
        <Text accessibilityLiveRegion="polite" style={f.note}>
          جارٍ البحث في الفتاوى والقرآن والتفسير…
        </Text>
      )}
      <View style={f.row}>
        {[
          "فسّر الآية الثانية من الفاتحة",
          "أبغى أستفسر عن صلاة الوتر",
          "ما مقاصد العلم والعمل؟",
          "حديث إنما الأعمال بالنيات",
          "كيف أبدأ التسميع؟",
        ].map((value) => (
          <Pressable
            accessibilityRole="button"
            key={value}
            style={f.chip}
            onPress={() => setInput(value)}
          >
            <Text style={f.label}>{value}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        nativeID="assistant-message"
        accessibilityLabel="رسالتك للمساعد"
        placeholder="اكتب سؤالك هنا…"
        multiline
        maxLength={1200}
        style={[f.input, { minHeight: 90 }]}
        value={input}
        onChangeText={setInput}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: pending || !input.trim() }}
        disabled={pending || !input.trim()}
        style={[f.button, (pending || !input.trim()) && { opacity: 0.55 }]}
        onPress={() => void send()}
      >
        <Text style={f.buttonText}>
          {pending ? "انتظر الإجابة…" : "إرسال الرسالة"}
        </Text>
      </Pressable>
      {!!messages.length && (
        <Pressable
          accessibilityRole="button"
          style={f.chip}
          onPress={() => {
            request.current?.abort();
            request.current = null;
            setPending(false);
            onMessagesChange([]);
          }}
        >
          <Text style={f.label}>بدء محادثة جديدة</Text>
        </Pressable>
      )}
      <Text style={f.note}>
        النص المنقول أو مقتطفه يبقى منسوبًا إلى مصدره. إذا ظهر شرح مساعد، فهو منفصل عن
        النص الأصلي. المحادثة محفوظة خلال الجلسة فقط.
      </Text>
    </>
  );
}
const s = StyleSheet.create({
  bubble: { maxWidth: "96%", width: "96%" },
  user: { alignSelf: "flex-end", backgroundColor: "#E4EDE0" },
  assistant: { alignSelf: "flex-start" },
  role: {
    color: "#17624D",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 10,
  },
  citation: { borderTopWidth: 1, borderTopColor: "#E4E8DF", marginTop: 14, paddingTop: 6 },
  explanation: { borderTopWidth: 1, borderTopColor: "#E4E8DF", marginTop: 16 },
});
