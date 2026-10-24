import { Image } from "expo-image";
import { Text, View } from "react-native";
import { APP_NAME } from "@/lib/config";
import { useTheme } from "./theme";

/** Logo de l'app : icône enveloppe + nom */
export function BrandLogo({ size = 28 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.35 }}>
      <Image
        source={require("@/assets/images/app-mark.png")}
        style={{ width: size * 1.35, height: size * 1.35, borderRadius: size * 0.3 }}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />
      <Text style={{ fontSize: size, fontWeight: "800", letterSpacing: -size * 0.04, color: t.text }}>{APP_NAME}</Text>
    </View>
  );
}
