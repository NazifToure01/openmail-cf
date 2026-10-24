import { useQuery } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useTheme } from "@/components/theme";
import { AppText, Avatar, Badge, Button, Card, Icon } from "@/components/ui";
import { describeAccess } from "@/lib/access";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { AppUser } from "@/lib/types";

export default function UsersScreen() {
  const t = useTheme();
  const { user: me } = useSession();
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ users: AppUser[] }>("/api/users").then((r) => r.users),
  });

  const list = users.data ?? [];

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={users.isRefetching} onRefresh={() => void users.refetch()} />}
    >
      <Stack.Screen options={{ title: "Utilisateurs" }} />

      <View style={{ gap: 4 }}>
        <AppText variant="heading">Gestion des comptes</AppText>
        <AppText variant="small" color={t.muted}>
          Chaque personne a son propre identifiant. Choisissez les domaines et les boîtes qu&apos;elle peut consulter et depuis lesquelles elle peut écrire.
        </AppText>
      </View>

      <Button
        title="Ajouter un utilisateur"
        icon="person-add-outline"
        onPress={() => router.push("/settings/user")}
      />

      {users.isPending ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : list.length === 0 ? (
        <Card style={{ padding: 24, alignItems: "center", gap: 8 }}>
          <Icon name="people-outline" size={32} color={t.muted} />
          <AppText style={{ textAlign: "center", fontWeight: "600" }}>Aucun utilisateur</AppText>
          <AppText variant="caption" color={t.muted} style={{ textAlign: "center" }}>
            Créez un premier utilisateur pour lui donner accès à vos boîtes e-mails.
          </AppText>
        </Card>
      ) : (
        <Card>
          {list.map((u, i) => {
            const isSelf = u.id === me?.id;
            return (
              <Pressable
                key={u.id}
                onPress={() => router.push({ pathname: "/settings/user", params: { id: u.id } })}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 14,
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: t.border,
                  backgroundColor: pressed ? t.surface2 : t.surface,
                  opacity: u.disabled ? 0.6 : 1,
                })}
              >
                <Avatar label={u.name || u.email} size={42} />

                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <AppText style={{ fontWeight: "600" }} numberOfLines={1}>
                      {u.name || u.email}
                    </AppText>
                    {u.role === "admin" && (
                      <Badge label="Admin" tone="accent" />
                    )}
                    {isSelf && (
                      <Badge label="Vous" tone="neutral" />
                    )}
                    {u.disabled && (
                      <Badge label="Désactivé" tone="warning" />
                    )}
                  </View>

                  <AppText variant="caption" color={t.muted} numberOfLines={1}>
                    {u.email}
                  </AppText>

                  <AppText variant="caption" color={t.subtle} numberOfLines={2}>
                    {describeAccess(u)}
                  </AppText>
                </View>

                <Icon name="chevron-forward" size={18} color={t.subtle} />
              </Pressable>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}
