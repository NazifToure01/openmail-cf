import { useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, View } from "react-native";
import { RichEditor } from "@/components/rich-editor";
import { useTheme } from "@/components/theme";
import { Button, Field, IconButton } from "@/components/ui";
import { api } from "@/lib/api";
import { useSignatures } from "@/lib/queries";

const TEMPLATE = "<p><strong>Prénom Nom</strong><br>Fonction</p><p>+33 6 00 00 00 00</p>";

export default function SignatureScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const signatures = useSignatures();
  const existing = signatures.data?.find((s) => s.id === id);
  const queryClient = useQueryClient();
  const [name, setName] = useState(existing?.name ?? (signatures.data?.length ? "Nouvelle signature" : "Signature principale"));
  const [html, setHtml] = useState(existing?.html ?? TEMPLATE);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(id ? `/api/signatures/${id}` : "/api/signatures", { method: id ? "PATCH" : "POST", json: { name, html } });
      await queryClient.invalidateQueries({ queryKey: ["signatures"] });
      router.back();
    } catch (err) {
      Alert.alert("Erreur", (err as Error).message);
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert(`Supprimer « ${name} » ?`, undefined, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await api(`/api/signatures/${id}`, { method: "DELETE" });
          await queryClient.invalidateQueries({ queryKey: ["signatures"] });
          router.back();
        },
      },
    ]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: t.surface }}>
      <Stack.Screen options={{ title: id ? "Modifier la signature" : "Nouvelle signature", headerRight: () => (id ? <IconButton name="trash-outline" label="Supprimer" onPress={remove} /> : null) }} />
      <View style={{ padding: 16 }}>
        <Field label="Nom de la signature" value={name} onChangeText={setName} />
      </View>
      <View style={{ flex: 1, borderTopWidth: 0.5, borderTopColor: t.border }}>
        <RichEditor initialHtml={html} onChange={setHtml} placeholder="Votre signature…" minHeight={200} />
      </View>
      <View style={{ padding: 16 }}>
        <Button title="Enregistrer" onPress={save} loading={busy} disabled={!name.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}
