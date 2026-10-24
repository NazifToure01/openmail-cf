import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  View,
} from "react-native";
import { radius, useTheme } from "@/components/theme";
import { AppText, Button, Card, Field, Icon, IconButton } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { AppUser, DomainOption } from "@/lib/types";

type AccessDraft = Record<string, null | "*" | string>;

/** Création / modification d'un compte et de ses droits (administrateurs) */
export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ users: AppUser[] }>("/api/users").then((r) => r.users),
  });
  const domainsQuery = useQuery({
    queryKey: ["domains"],
    queryFn: () => api<{ domains: DomainOption[]; current: string | null }>("/api/domains"),
  });

  const domainList: DomainOption[] = Array.isArray(domainsQuery.data)
    ? domainsQuery.data
    : Array.isArray(domainsQuery.data?.domains)
      ? domainsQuery.data.domains
      : [];

  const existing = id ? users.data?.find((u) => u.id === id) : undefined;

  if (domainsQuery.isPending || (id && users.isPending)) {
    return <ActivityIndicator style={{ marginTop: 40 }} />;
  }

  if (id && users.isSuccess && !existing) {
    return (
      <View style={{ padding: 24, alignItems: "center", gap: 12 }}>
        <AppText color="red">Compte utilisateur introuvable.</AppText>
        <Button title="Retour" onPress={() => router.back()} />
      </View>
    );
  }

  return <UserForm id={id} existing={existing} domains={domainList} />;
}

function UserForm({
  id,
  existing,
  domains,
}: {
  id?: string;
  existing?: AppUser;
  domains: DomainOption[];
}) {
  const t = useTheme();
  const { user: me } = useSession();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState(existing?.email ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [password, setPassword] = useState("");
  const [admin, setAdmin] = useState(existing?.role === "admin");
  const [disabled, setDisabled] = useState(Boolean(existing?.disabled));

  const [access, setAccess] = useState<AccessDraft>(() => {
    const acc: AccessDraft = {};
    for (const d of domains) {
      const dName = typeof d === "string" ? d : d.name;
      const a = existing?.access?.find((x) => x.domain === dName);
      acc[dName] = !a
        ? null
        : a.mailboxes === "*"
          ? "*"
          : Array.isArray(a.mailboxes)
            ? a.mailboxes.join(", ")
            : String(a.mailboxes);
    }
    return acc;
  });

  const [busy, setBusy] = useState(false);

  const save = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      Alert.alert("Erreur", "L'adresse e-mail est obligatoire.");
      return;
    }
    if (!id && password.length < 10) {
      Alert.alert("Erreur", "Le mot de passe doit comporter au moins 10 caractères.");
      return;
    }
    if (id && password && password.length < 10) {
      Alert.alert("Erreur", "Le nouveau mot de passe doit comporter au moins 10 caractères.");
      return;
    }

    setBusy(true);
    const body = {
      email: cleanEmail,
      name: name.trim() || cleanEmail,
      role: admin ? "admin" : "member",
      disabled,
      access: Object.entries(access)
        .filter(([, v]) => v !== null)
        .map(([domain, v]) => ({
          domain,
          mailboxes:
            v === "*"
              ? "*"
              : String(v)
                  .split(/[,;\s]+/)
                  .map((s) => s.trim().toLowerCase())
                  .filter(Boolean),
        })),
      ...(password ? { password } : {}),
    };

    try {
      await api(id ? `/api/users/${encodeURIComponent(id)}` : "/api/users", {
        method: id ? "PATCH" : "POST",
        json: body,
      });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      router.back();
    } catch (err) {
      Alert.alert("Erreur", (err as Error).message);
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert(`Supprimer le compte de ${existing?.name || name} ?`, `L'adresse ${existing?.email || email} sera supprimée.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/api/users/${encodeURIComponent(id!)}`, { method: "DELETE" });
            await queryClient.invalidateQueries({ queryKey: ["users"] });
            router.back();
          } catch (e) {
            Alert.alert("Erreur", (e as Error).message);
          }
        },
      },
    ]);

  const self = id === me?.id;
  const isSubmitDisabled = busy || !email.trim() || (!id && password.length < 10);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Stack.Screen
          options={{
            title: id ? "Modifier le compte" : "Nouveau compte",
            headerRight: () =>
              id && !self ? (
                <IconButton name="trash-outline" label="Supprimer" onPress={remove} color={t.danger} />
              ) : null,
          }}
        />

        <Card style={{ padding: 16, gap: 14 }}>
          <Field
            label="Nom complet"
            placeholder="ex. Jean Dupont"
            value={name}
            onChangeText={setName}
          />
          <Field
            label="E-mail (identifiant)"
            placeholder="jean@example.com"
            value={email}
            onChangeText={setEmail}
            editable={!id}
            autoCapitalize="none"
            keyboardType="email-address"
            hint={id ? "L'identifiant e-mail ne peut pas être modifié." : undefined}
          />
          <Field
            label={id ? "Nouveau mot de passe (facultatif)" : "Mot de passe (10 caractères minimum)"}
            placeholder={id ? "Laisser vide pour ne pas changer" : "Minimum 10 caractères"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            hint="Changer le mot de passe déconnecte la personne sur tous ses appareils."
          />
        </Card>

        <Card style={{ padding: 16, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <AppText style={{ fontWeight: "600" }}>Administrateur</AppText>
              <AppText variant="caption" color={t.muted}>
                Accès à tous les domaines, gestion des utilisateurs et des adresses
              </AppText>
            </View>
            <Switch value={admin} onValueChange={setAdmin} disabled={self} />
          </View>

          {id && !self && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: t.border,
              }}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <AppText style={{ fontWeight: "600" }}>Compte désactivé</AppText>
                <AppText variant="caption" color={t.muted}>
                  Bloque temporairement l&apos;accès à l&apos;application
                </AppText>
              </View>
              <Switch value={disabled} onValueChange={setDisabled} />
            </View>
          )}
        </Card>

        {!admin && (
          <Card style={{ padding: 16, gap: 14 }}>
            <View style={{ gap: 4 }}>
              <AppText variant="heading">Accès aux domaines</AppText>
              <AppText variant="small" color={t.muted}>
                Sélectionnez les domaines et les boîtes accessibles pour ce compte.
              </AppText>
            </View>

            {domains.length === 0 ? (
              <AppText variant="small" color={t.muted}>
                Aucun domaine disponible sur ce serveur.
              </AppText>
            ) : (
              domains.map((d) => {
                const domainName = typeof d === "string" ? d : d.name;
                const v = access[domainName] ?? null;
                const set = (next: AccessDraft[string]) =>
                  setAccess((a) => ({ ...a, [domainName]: next }));
                const isChecked = v !== null;

                return (
                  <View
                    key={domainName}
                    style={{
                      gap: 10,
                      paddingVertical: 10,
                      borderTopWidth: 1,
                      borderTopColor: t.border,
                    }}
                  >
                    <Pressable
                      onPress={() => set(isChecked ? null : "*")}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                    >
                      <Icon
                        name={isChecked ? "checkbox" : "square-outline"}
                        color={isChecked ? t.accent : t.muted}
                        size={22}
                      />
                      <AppText style={{ fontWeight: "600", fontSize: 16 }}>{domainName}</AppText>
                    </Pressable>

                    {isChecked && (
                      <View style={{ paddingLeft: 32, gap: 10 }}>
                        <Pressable
                          onPress={() => set("*")}
                          style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                        >
                          <Icon
                            name={v === "*" ? "radio-button-on" : "radio-button-off"}
                            color={t.accent}
                            size={20}
                          />
                          <AppText variant="small">Toutes les boîtes du domaine</AppText>
                        </Pressable>

                        <Pressable
                          onPress={() => set(v === "*" ? "" : v)}
                          style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                        >
                          <Icon
                            name={v !== "*" ? "radio-button-on" : "radio-button-off"}
                            color={t.accent}
                            size={20}
                          />
                          <AppText variant="small">Seulement certaines boîtes :</AppText>
                        </Pressable>

                        {v !== "*" && (
                          <Field
                            value={v ?? ""}
                            onChangeText={set}
                            placeholder={`contact@${domainName}, info@${domainName}`}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            hint="Séparez plusieurs adresses par des virgules."
                          />
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </Card>
        )}

        <Button
          title={id ? "Enregistrer les modifications" : "Créer le compte"}
          onPress={save}
          loading={busy}
          disabled={isSubmitDisabled}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
