import { useState } from "react";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Pressable, Text, View } from "react-native";
import type { TajweedClip } from "../tajweed";
import { f } from "./featureStyles";
const time = (value: number) => `${Math.floor(Math.max(0, value)/60)}:${String(Math.floor(Math.max(0, value)%60)).padStart(2, "0")}`;
function Video({ clip, onRetry }: { clip: TajweedClip; onRetry: () => void }) {
  const player = useVideoPlayer(clip.streamUrl, instance => { instance.loop = false; });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  return <View>
    <VideoView nativeID="tajweed-video-player" player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} style={{ width: "100%", aspectRatio: 4/3, backgroundColor: "#142A24", borderRadius: 12 }} />
    {status === "loading" && <Text accessibilityLiveRegion="polite" style={f.note}>جارٍ تحميل الفيديو من مصدره…</Text>}
    {status === "error" && <><Text style={f.error}>تعذّر تحميل الفيديو. تحقق من الاتصال أو جرّب المقطع الآخر إن توفر.</Text><Pressable accessibilityRole="button" style={f.chip} onPress={onRetry}><Text style={f.label}>إعادة تحميل المقطع</Text></Pressable></>}
  </View>;
}
function Audio({ clip, onRetry }: { clip: TajweedClip; onRetry: () => void }) {
  const player = useAudioPlayer(clip.streamUrl);
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState("");
  const toggle = async () => {
    try { setError(""); if (status.playing) player.pause(); else { if (status.didJustFinish) await player.seekTo(0); player.play(); } }
    catch { setError("تعذّر تشغيل التسجيل. تحقق من اتصالك وأعد المحاولة."); }
  };
  const seek = async (delta: number) => {
    try { await player.seekTo(Math.max(0, Math.min(status.duration || 0, status.currentTime+delta))); }
    catch { setError("تعذّر تغيير موضع التسجيل الآن."); }
  };
  return <View>
    <Text style={f.note}>شرح صوتي · {time(status.currentTime)} / {time(status.duration || clip.duration || 0)}</Text>
    <Pressable accessibilityRole="button" style={f.button} onPress={() => void toggle()}><Text style={f.buttonText}>{status.playing ? "إيقاف الشرح الصوتي مؤقتًا" : "تشغيل الشرح الصوتي"}</Text></Pressable>
    <View style={f.row}>
      <Pressable accessibilityRole="button" disabled={!status.isLoaded} accessibilityState={{ disabled: !status.isLoaded }} style={f.chip} onPress={() => void seek(-15)}><Text style={f.label}>رجوع ١٥ ثانية</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!status.isLoaded} accessibilityState={{ disabled: !status.isLoaded }} style={f.chip} onPress={() => void seek(15)}><Text style={f.label}>تقديم ١٥ ثانية</Text></Pressable>
    </View>
    {status.isBuffering && <Text style={f.note}>جارٍ تحميل التسجيل…</Text>}
    {!!(error || status.error) && <><Text style={f.error}>{error || "تعذّر تحميل التسجيل من مصدره. حاول مجددًا."}</Text><Pressable accessibilityRole="button" style={f.chip} onPress={onRetry}><Text style={f.label}>إعادة تحميل المقطع</Text></Pressable></>}
  </View>;
}
export default function TajweedMedia({ clip }: { clip: TajweedClip }) {
  const [retry, setRetry] = useState(0);
  return clip.type === "video" ? <Video key={`${clip.id}:${retry}`} clip={clip} onRetry={() => setRetry(value => value+1)} /> : <Audio key={`${clip.id}:${retry}`} clip={clip} onRetry={() => setRetry(value => value+1)} />;
}
