import { useState } from "react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Pressable, Text, View } from "react-native";
import { f } from "./featureStyles";
export default function VerseAudio({
  source,
  label,
}: {
  source: string;
  label: string;
}) {
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const [failed, setFailed] = useState(false);
  const toggle = async () => {
    try {
      setFailed(false);
      if (status.playing) player.pause();
      else {
        if (
          status.didJustFinish ||
          (status.duration > 0 && status.currentTime >= status.duration)
        )
          await player.seekTo(0);
        player.play();
      }
    } catch {
      setFailed(true);
    }
  };
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        style={f.button}
        onPress={() => void toggle()}
      >
        <Text style={f.buttonText}>
          {status.playing ? "إيقاف مؤقت" : label}
        </Text>
      </Pressable>
      {status.isBuffering && <Text style={f.note}>جارٍ تحميل الآية…</Text>}
      {(failed || !!status.error) && (
        <Text style={f.error}>
          تعذّر تحميل الآية. تحقق من اتصالك وحاول مجددًا.
        </Text>
      )}
    </View>
  );
}
