import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, View } from "react-native";
import { WelcomeScreen } from "@/components/screen";
import { radius, useTheme } from "@/components/theme";
import { AppText, Button, Icon } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { DomainOption } from "@/lib/types";

export default function DomainScreen() {
  const t = useTheme();
  const { chooseDomain, signOut } = useSession();
  const domains = useQuery({
    queryKey: ["domains"],
    queryFn: () => api<{ domains: DomainOption[]; current: string | null }>("/api/domains"),
  });

  return (
    <WelcomeScreen title="Choisissez un domaine" subtitle="Vous enverrez et recevrez les e-mails de ce domaine. Vous pourrez en changer à tout moment.">
      {domains.isPending ? (
        <ActivityIndicator />
      ) : domains.error ? (
        <View style={{ gap: 12 }}>
          <AppText color={t.danger}>{(domains.error as Error).message}</AppText>
          <Button title="Réessayer" variant="secondary" onPress={() => void domains.refetch()} />
        </View>
      ) : domains.data.domains.length === 0 ? (
        <AppText color={t.muted}>Aucun domaine ne vous est attribué. Contactez votre administrateur.</AppText>
      ) : (
        <View style={{ gap: 10 }}>
          {domains.data.domains.map((d) => (
            <Pressable
              key={d.name}
              onPress={() => void chooseDomain(d.name)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 16,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: t.border,
                backgroundColor: pressed ? t.surface2 : t.surface,
              })}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" }}>
                <AppText color={t.accentFg} style={{ fontWeight: "800", textTransform: "uppercase" }}>{d.name[0]}</AppText>
              </View>
              <AppText variant="heading" style={{ flex: 1 }}>{d.name}</AppText>
              <Icon name="chevron-forward" color={t.subtle} />
            </Pressable>
          ))}
        </View>
      )}
      <Button title="Se déconnecter" variant="ghost" onPress={() => void signOut()} />
    </WelcomeScreen>
  );
}
