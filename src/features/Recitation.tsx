import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Surah } from "../content";
import { matchRecitation, normalizeArabic, RecitationProgress } from "./recitation";
import { f } from "./featureStyles";

export default function Recitation({ surah }: { surah: Surah }) {
  const verses = useMemo(
    () => surah.verses.map((verse) => normalizeArabic(verse).split(" ").filter(Boolean)),
    [surah],
  );
  const progress = useRef<RecitationProgress>({ verse: 0, pending: [] });
  const [completed, setCompleted] = useState(0);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(true);
  const wanted = useRef(false);
  const session = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interruptions = useRef(0);
  const startedAt = useRef(0);
  const clearRetry = () => {
    if (retry.current) clearTimeout(retry.current);
    retry.current = null;
  };
  const stop = () => {
    session.current++;
    wanted.current = false;
    clearRetry();
    setListening(false);
    ExpoSpeechRecognitionModule.abort();
  };
  const beginRecognition = () => {
    if (!active.current || !wanted.current) return;
    try {
      startedAt.current = Date.now();
      ExpoSpeechRecognitionModule.start({
        lang: "ar-SA",
        interimResults: false,
        continuous: true,
        maxAlternatives: 1,
      });
    } catch {
      wanted.current = false;
      setListening(false);
      setMessage("تعذّر تشغيل الميكروفون. اضغط ابدأ التسميع للمحاولة مجددًا.");
    }
  };
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      wanted.current = false;
      if (retry.current) clearTimeout(retry.current);
      try { ExpoSpeechRecognitionModule.abort(); } catch { /* Device unavailable. */ }
    };
  }, []);
  useSpeechRecognitionEvent("start", () => {
    if (!active.current) return;
    if (!wanted.current) { ExpoSpeechRecognitionModule.abort(); return; }
    setListening(true);
  });
  useSpeechRecognitionEvent("end", () => {
    if (!active.current || !wanted.current) return;
    // Browsers and mobile recognizers may end even with continuous enabled.
    // Preserve the session and hidden partial verse through normal pauses.
    interruptions.current = Date.now() - startedAt.current < 1500
      ? interruptions.current + 1 : 0;
    if (interruptions.current >= 3) {
      wanted.current = false;
      setListening(false);
      setMessage("توقف التعرّف الصوتي عدة مرات. تحقق من إذن الميكروفون والاتصال، ثم ابدأ مجددًا.");
      return;
    }
    clearRetry();
    retry.current = setTimeout(beginRecognition, 350);
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (!active.current || !wanted.current) return;
    if (event.error === "no-speech") return; // Resume on end after a quiet pause.
    wanted.current = false;
    clearRetry();
    setListening(false);
    setMessage(event.error === "not-allowed"
      ? "لم يُسمح باستخدام الميكروفون. فعّل الإذن في المتصفح أو إعدادات الجهاز."
      : "تعذّر التعرّف على الصوت. تحقق من الاتصال ثم ابدأ التسميع مجددًا.");
  });
  useSpeechRecognitionEvent("result", (event) => {
    if (!active.current || !wanted.current || !event.isFinal) return;
    interruptions.current = 0;
    const next = matchRecitation(verses, progress.current, event.results[0]?.transcript ?? "");
    progress.current = next;
    setCompleted(next.verse);
    if (next.verse === verses.length) {
      stop();
      setMessage("أتممت تسميع السورة. أحسنت!");
    }
  });
  const start = async () => {
    if (wanted.current || completed === verses.length) return;
    wanted.current = true;
    const request = ++session.current;
    setListening(true);
    setMessage("");
    interruptions.current = 0;
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        wanted.current = false;
        setListening(false);
        setMessage("التعرّف الصوتي غير متاح هنا. على اللابتوب جرّب Chrome أو Edge عبر رابط HTTPS.");
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!active.current || !wanted.current || session.current !== request) return;
      if (!permission.granted) {
        wanted.current = false;
        setListening(false);
        setMessage("يلزم السماح بالميكروفون لبدء التسميع.");
        return;
      }
      beginRecognition();
    } catch {
      if (!active.current || session.current !== request) return;
      wanted.current = false;
      setListening(false);
      setMessage("تعذّر بدء التسميع. تحقق من إذن الميكروفون ثم حاول مجددًا.");
    }
  };

  return (
    <>
      <View style={f.card}>
        <Text style={f.title}>سمّع بصوتك</Text>
        <Text style={f.text}>
          اضغط ابدأ التسميع واقرأ من أول السورة. يستمر الميكروفون بالاستماع،
          وتظهر كل آية بعد مطابقتها كاملة. إذا أخطأت، أعد الآية ولن يظهر النص حتى تطابقها.
        </Text>
        <Pressable accessibilityRole="button" disabled={completed === verses.length}
          accessibilityState={{ disabled: completed === verses.length }} style={f.button}
          onPress={() => { if (wanted.current) stop(); else void start(); }}>
          <Text style={f.buttonText}>{listening ? "إيقاف التسميع" : "ابدأ التسميع"}</Text>
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={f.note}>
          {listening ? "● الميكروفون يستمع الآن" : "الميكروفون متوقف"} · {completed} / {verses.length} آيات
        </Text>
        <Pressable accessibilityRole="button" style={f.chip} onPress={() => {
          stop();
          progress.current = { verse: 0, pending: [] };
          setCompleted(0);
          setMessage("");
        }}>
          <Text style={f.label}>إعادة التسميع من البداية</Text>
        </Pressable>
        {!!message && <Text accessibilityLiveRegion="polite" style={f.note}>{message}</Text>}
        <Text style={f.note}>
          قد يخطئ التعرّف الصوتي؛ المطابقة لا تقيّم التجويد أو مخارج الحروف.
          قد يعالج مزوّد المتصفح أو الجهاز الصوت، والتطبيق لا يحفظ التسجيل.
        </Text>
      </View>
      <View style={f.card}>
        {surah.verses.map((verse, i) => (
          <Text key={i} style={f.verse} accessibilityLabel={i < completed ? verse : `الآية ${i + 1} مخفية`}>
            <Text style={i < completed ? undefined : f.hidden}>{i < completed ? verse : "••• ••• •••"} </Text>
            <Text style={f.source}>﴿{(i + 1).toLocaleString("ar-SA")}﴾</Text>
          </Text>
        ))}
      </View>
    </>
  );
}
