import { Text } from "react-native";
import type { QuranVerseProps } from "./QuranVerse.types";
export default function QuranVerse({ label, highlighted, onPress, children }: QuranVerseProps) {
  return <Text accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={highlighted ? { backgroundColor: "#E6EEDD" } : undefined}>{children}</Text>;
}
