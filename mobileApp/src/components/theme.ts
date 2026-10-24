import { useColorScheme } from "react-native";

/** Couleurs de la marque : bleu nuit #101C3B, orange #F5A524, blanc cassé #F7F7F5 (mêmes jetons que le web) */
const light = {
  bg: "#F7F7F5",
  surface: "#FFFFFF",
  surface2: "#F1F2F4",
  border: "#E4E6EB",
  text: "#101C3B",
  muted: "#5D6880",
  subtle: "#8C95A8",
  accent: "#101C3B",
  accentFg: "#FFFFFF",
  accentSoft: "#E8EBF3",
  orange: "#F5A524",
  danger: "#D63B3B",
  dangerSoft: "#FDECEC",
  success: "#188A4C",
  successSoft: "#E6F6ED",
  warning: "#B86E00",
  warningSoft: "#FFF4E0",
};

const dark: typeof light = {
  bg: "#0B1226",
  surface: "#111A33",
  surface2: "#17213F",
  border: "#233055",
  text: "#EEF0F5",
  muted: "#9BA5BD",
  subtle: "#6D7897",
  accent: "#F5A524",
  accentFg: "#101C3B",
  accentSoft: "#33280F",
  orange: "#F5A524",
  danger: "#F06B6B",
  dangerSoft: "#3A1C1F",
  success: "#4CC584",
  successSoft: "#14302A",
  warning: "#F0B14A",
  warningSoft: "#3A2C12",
};

export type Palette = typeof light;

export function useTheme(): Palette & { dark: boolean } {
  const scheme = useColorScheme();
  return scheme === "dark" ? { ...dark, dark: true } : { ...light, dark: false };
}

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
