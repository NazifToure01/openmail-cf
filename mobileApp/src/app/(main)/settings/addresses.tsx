import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, TextInput, View } from "react-native";
import { radius, useTheme } from "@/components/theme";
import { AppText, Badge, Button, Card, Field, IconButton } from "@/components/ui";
import { LOCAL_PART_RE } from "@/lib/addresses";
import { api } from "@/lib/api";
import { useIdentities } from "@/lib/queries";
import { useSession } from "@/lib/session";
import type { RoutingStatus } from "@/lib/types";

const STATUS: Record<RoutingStatus, { label: string; tone: "success" | "warning" | "neutral" }> = {
  worker: { label: "Réception active", tone: "success" },
  catchall: { label: "Réception (catch-all)", tone: "success" },
  other: { label: "Reçu ailleurs", tone: "warning" },
  none: { label: "Ne reçoit pas", tone: "neutral" },
};

/** Adresses d'envoi du domaine (administrateurs) ; l'ajout crée la règle de réception Cloudflare */
export default function AddressesScreen() {
  const t = useTheme();
  const { domain } = useSession();
  const identities = useIdentities();
  const queryClient = useQueryClient();
  const [local, setLocal] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["identities"] });

  const add = async () => {
    setBusy(true);
    try {
      const res = await api<{ routing: { result?: string; error?: string } | null }>("/api/identities", {
        json: { address: `${local}@${domain}`, name },
      });
      if (res.routing?.error) Alert.alert("Adresse ajoutée", `La réception n'a pas pu être activée : ${res.routing.error}`);
      setLocal("");
      setName("");
      await refresh();
    } catch (err) {
      Alert.alert("Erreur", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string, address: string, receiving: boolean) =>
    Alert.alert(`Retirer ${address} ?`, receiving ? "Sa règle de réception sera supprimée : les e-mails envoyés à cette adresse ne seront plus reçus." : undefined, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: async () => {
          await api(`/api/identities/${id}`, { method: "DELETE" }).catch((e: Error) => Alert.alert("Erreur", e.message));
          await refresh();
        },
      },
    ]);

  const activate = async (id: string) => {
    await api(`/api/identities/${id}/routing`, { method: "POST" }).catch((e: Error) => Alert.alert("Erreur", e.message));
    await refresh();
  };

  const routing = identities.data?.routing;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      {routing?.error && <AppText variant="small" color={t.danger}>Réception : {routing.error}</AppText>}
      {identities.isPending ? (
        <ActivityIndicator />
      ) : (
        <Card>
          {(identities.data?.identities ?? []).map((i) => {
            const status = routing?.statuses[i.address];
            return (
              <View key={i.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: t.border }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText numberOfLines={1}>{i.name || i.address}</AppText>
                  <AppText variant="caption" color={t.muted}>{i.address}</AppText>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {i.isDefault && <Badge label="Par défaut" tone="accent" />}
                    {status && <Badge label={STATUS[status].label} tone={STATUS[status].tone} />}
                  </View>
                </View>
                {routing?.configured && (status === "none" || status === "other") && <Button title="Activer" variant="secondary" onPress={() => void activate(i.id)} />}
                <IconButton name="trash-outline" label="Retirer" onPress={() => remove(i.id, i.address, status === "worker")} />
              </View>
            );
          })}
          {!identities.data?.identities.length && <AppText color={t.muted} style={{ padding: 16 }}>Aucune adresse enregistrée.</AppText>}
        </Card>
      )}

      <Card style={{ padding: 16, gap: 12 }}>
        <AppText variant="heading">Nouvelle adresse</AppText>
        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 0.5, borderColor: t.border, borderRadius: radius.md, paddingHorizontal: 12, backgroundColor: t.surface }}>
          <TextInput value={local} onChangeText={(v) => setLocal(v.trim().toLowerCase())} placeholder="contact" placeholderTextColor={t.subtle} autoCapitalize="none" style={{ flex: 1, height: 48, color: t.text, fontSize: 16 }} />
          <AppText color={t.muted}>@{domain}</AppText>
        </View>
        <Field label="Nom affiché" value={name} onChangeText={setName} placeholder="Ex. Support Example" />
        <Button title="Ajouter" icon="add" onPress={add} loading={busy} disabled={!LOCAL_PART_RE.test(local)} />
      </Card>
    </ScrollView>
  );
}
