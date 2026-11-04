import { Platform } from "react-native";
export const contentBase =
  Platform.OS === "web"
    ? ""
    : process.env.EXPO_PUBLIC_CONTENT_API_URL ||
      "https://joyful-kangaroo-2ad9b7.netlify.app";
