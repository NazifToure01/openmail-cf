import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandLogo } from "./brand";
import { AppText } from "./ui";
import { useTheme } from "./theme";

/** Écran d'accueil (connexion, verrouillage, choix du domaine) : logo + titre + contenu centré */
export function WelcomeScreen({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ maxWidth: 440, width: "100%", alignSelf: "center", gap: 20 }}>
            <BrandLogo />
            <View style={{ gap: 6 }}>
              <AppText variant="title">{title}</AppText>
              <AppText color={t.muted}>{subtitle}</AppText>
            </View>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
