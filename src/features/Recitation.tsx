import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Surah } from "../content";
import { advanceRecitation, normalizeArabic } from "./recitation";
import { f } from "./featureStyles";
export default function Recitation({ surah }: { surah: Surah }) {
  const words = useMemo(() => surah.verses.map((v) => v.split(/\s+/)), [surah]);
  const expected = useMemo(() => words.flat().map(normalizeArabic), [words]);
  const [cursor, setCursor] = useState(0);
  const position = useRef(0);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const [transcript, setTranscript] = useState("");
  const [mode, setMode] = useState<"words" | "verses">("words");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* Recognition may be unavailable on this device. */
      }
    };
  }, []);
  useSpeechRecognitionEvent("start", () => {
    if (active.current) setListening(true);
  });
  useSpeechRecognitionEvent("end", () => {
    if (active.current) setListening(false);
  });
  useSpeechRecognitionEvent("error", (e) => {
    if (!active.current || e.error === "aborted") return;
    setListening(false);
    setMessage(
      e.error === "not-allowed"
        ? "لم يُسمح باستخدام الميكروفون. فعّل الإذن في المتصفح أو إعدادات الجهاز."
        : e.error === "no-speech"
          ? "لم نلتقط كلامًا واضحًا. اضغط بدء وحاول مجددًا."
          : "تعذّر التعرّف على الصوت. تحقق من الاتصال ودعم اللغة العربية ثم حاول مجددًا.",
    );
  });
  useSpeechRecognitionEvent("result", (e) => {
    if (!active.current || !e.isFinal) return;
    const heard = e.results[0]?.transcript ?? "";
    setTranscript(heard);
    const next = advanceRecitation(expected, position.current, heard);
    setMessage(
      next > position.current
        ? "تمت مطابقة الكلمات الظاهرة مع النص."
        : "لم تتطابق بداية المقطع مع الكلمة التالية؛ أعد قراءتها بوضوح. قد يخطئ التعرّف الصوتي.",
    );
    position.current = next;
    setCursor(next);
    if (next === expected.length) {
      ExpoSpeechRecognitionModule.stop();
      setMessage(
        "اكتملت مطابقة نص السورة. هذا لا يُعد تقييمًا للتجويد أو مخارج الحروف.",
      );
    }
  });
  const start = async () => {
    setMessage("");
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setMessage(
          "التعرّف الصوتي غير متاح هنا. على اللابتوب جرّب Chrome أو Edge عبر رابط HTTPS. على الهاتف يلزم إصدار تطوير أصلي يدعم هذه الميزة.",
        );
        return;
      }
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setMessage("يلزم السماح بالميكروفون لبدء التسميع.");
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: "ar-SA",
        interimResults: false,
        continuous: true,
        maxAlternatives: 1,
      });
    } catch {
      setMessage(
        "تعذّر بدء التسميع في هذا الجهاز. جرّب متصفحًا يدعم التعرّف الصوتي.",
      );
    }
  };

  return (
    <>
      <View style={f.card}>
        <Text style={f.title}>سمّع بصوتك</Text>
        <Text style={f.text}>
          الآيات مخفية. ابدأ من أول السورة واقرأ بوضوح، ثم توقّف قليلًا حتى
          يعتمد المتعرّف المقطع. تظهر الكلمات المطابقة بالتتابع، أو الآية بعد
          اكتمالها حسب اختيارك.
        </Text>
        <Text style={f.note}>
          بضغط «بدء التسميع» تسمح بالتعرّف الصوتي. قد يرسل المتصفح أو نظام
          الجهاز الصوت إلى مزوّد خدمته. التطبيق لا يحفظ التسجيل. هذه مطابقة نصية
          تجريبية، وليست تصحيحًا للتجويد أو تقنية ترتيل نفسها.
        </Text>
        <View style={f.row}>
          {(["words", "verses"] as const).map((value) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === value }}
              key={value}
              style={[f.chip, mode === value && f.selected]}
              onPress={() => setMode(value)}
            >
              <Text style={f.label}>
                {value === "words" ? "إظهار كلمة بكلمة" : "إظهار الآية كاملة"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: cursor === expected.length }}
          disabled={cursor === expected.length}
          style={f.button}
          onPress={() => {
            if (listening) ExpoSpeechRecognitionModule.stop();
            else void start();
          }}
        >
          <Text style={f.buttonText}>
            {listening ? "إيقاف الاستماع" : "بدء التسميع"}
          </Text>
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={f.note}>
          {listening ? "● الميكروفون يستمع الآن" : "الميكروفون متوقف"} ·{" "}
          {cursor} / {expected.length} كلمة
        </Text>
        <Pressable
          accessibilityRole="button"
          style={f.chip}
          onPress={() => {
            ExpoSpeechRecognitionModule.abort();
            position.current = 0;
            setCursor(0);
            setTranscript("");
            setMessage("");
            setListening(false);
          }}
        >
          <Text style={f.label}>إعادة التسميع من البداية</Text>
        </Pressable>
        {!!message && (
          <Text accessibilityLiveRegion="polite" style={f.note}>
            {message}
          </Text>
        )}
        {!!transcript && (
          <Text style={f.note}>التقط المتعرّف: {transcript}</Text>
        )}
      </View>
      <View style={f.card}>
        {words.map((verse, i) => {
          const start = words.slice(0, i).reduce((n, v) => n + v.length, 0);
          const complete = cursor >= start + verse.length;
          return (
            <Text key={i} style={f.verse}>
              {verse.map((word, j) => {
                const visible =
                  mode === "verses" ? complete : cursor > start + j;
                return (
                  <Text
                    key={j}
                    accessibilityLabel={visible ? word : "كلمة مخفية"}
                    style={!visible ? f.hidden : undefined}
                  >
                    {visible ? word : "•••"}{" "}
                  </Text>
                );
              })}
              <Text style={f.source}>﴿{(i + 1).toLocaleString("ar-SA")}﴾</Text>
            </Text>
          );
        })}
      </View>
    </>
  );
}
