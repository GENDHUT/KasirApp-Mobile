// hooks/use-theme-colors.ts
import { useColorScheme } from "react-native";

export const Colors = {
  light: {
    bg: "#ffffff",
    card: "#f4f4f5",
    text: "#111111",
    subtext: "#6b7280",
    border: "#e5e7eb",
    primary: "#111111",
    danger: "#dc2626",
  },
  dark: {
    bg: "#0a0a0a",
    card: "#18181b",
    text: "#fafafa",
    subtext: "#a1a1aa",
    border: "#27272a",
    primary: "#fafafa",
    danger: "#f87171",
  },
};

export function useThemeColors() {
  const scheme = useColorScheme();
  return Colors[scheme === "dark" ? "dark" : "light"];
}