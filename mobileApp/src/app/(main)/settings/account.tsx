import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import { AppText, Button, Card, Field } from "@/components/ui";
import { useTheme } from "@/components/theme";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function AccountScreen() {
  const t = useTheme();
  const { user, refreshUser, signOut } = useSession();
  const [name, setName] = useState(user?.name ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  const saveName = async () => {
    setBusy(true);
    try {
      await api("/api/auth/me", { method: "PATCH", json: { name } });
      await refreshUser();
      Alert.alert("Nom mis à jour");
    } catch (err) {
      Alert.alert("Erreur", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    setBusy(true);
    try {
      await api("/api/auth/me", { method: "PATCH", json: { currentPassword: current, newPassword: next } });
      Alert.alert("Mot de passe modifié", "Reconnectez-vous avec votre nouveau mot de passe.", [{ text: "OK", onPress: () => void signOut() }]);
    } catch (err) {
      Alert.alert("Erreur", (err as Error).message);
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }} keyboardShouldPersistTaps="handled">
      <Card style={{ padding: 16, gap: 12 }}>
        <AppText variant="heading">Profil</AppText>
        <Field label="Nom affiché" value={name} onChangeText={setName} />
        <Button title="Enregistrer" onPress={saveName} loading={busy} disabled={!name.trim() || name === user?.name} />
      </Card>
      <Card style={{ padding: 16, gap: 12 }}>
        <AppText variant="heading">Mot de passe</AppText>
        <Field label="Mot de passe actuel" value={current} onChangeText={setCurrent} secureTextEntry textContentType="password" />
        <Field label="Nouveau mot de passe" value={next} onChangeText={setNext} secureTextEntry textContentType="newPassword" hint="10 caractères minimum. Vos autres appareils seront déconnectés." />
        <Button title="Changer le mot de passe" onPress={savePassword} loading={busy} disabled={!current || next.length < 10} />
      </Card>
      <AppText variant="caption" color={t.subtle}>{user?.email}</AppText>
    </ScrollView>
  );
}
