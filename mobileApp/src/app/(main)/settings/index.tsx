import { router } from "expo-router";
import { Alert, ScrollView, Switch, View } from "react-native";
import { useTheme } from "@/components/theme";
import { AppText, Avatar, Card, ListRow } from "@/components/ui";
import { API_URL } from "@/lib/config";
import { useSession } from "@/lib/session";

export default function SettingsScreen() {
  const t = useTheme();
  const { user, domain, chooseDomain, signOut, biometricAvailable, biometricEnabled, setBiometricEnabled } = useSession();
  const admin = user?.role === "admin";

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}>
        <Avatar label={user?.name || user?.email || "?"} size={48} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{user?.name}</AppText>
          <AppText variant="small" color={t.muted}>{user?.email}</AppText>
          <AppText variant="caption" color={t.subtle}>{admin ? "Administrateur" : "Membre"} · @{domain}</AppText>
        </View>
      </Card>

      <Card>
        <ListRow icon="person-circle-outline" title="Mon compte" subtitle="Nom, mot de passe" onPress={() => router.push("/settings/account")} />
        <ListRow icon="notifications-outline" title="Notifications" subtitle="Alertes nouveaux e-mails, état du service" onPress={() => router.push("/settings/notifications")} />
        <ListRow icon="create-outline" title="Signatures" onPress={() => router.push("/settings/signatures")} />
        <ListRow icon="people-outline" title="Contacts" onPress={() => router.push("/settings/contacts")} />
        {admin && <ListRow icon="at" title="Adresses d'envoi" subtitle="Réception automatique chez Cloudflare" onPress={() => router.push("/settings/addresses")} />}
        {admin && <ListRow icon="shield-checkmark-outline" title="Utilisateurs" subtitle="Comptes et droits" onPress={() => router.push("/settings/users")} />}
      </Card>

      <Card>
        <ListRow icon="globe-outline" title="Changer de domaine" subtitle={`Actuel : ${domain}`} onPress={() => void chooseDomain(null)} />
        {biometricAvailable && (
          <ListRow
            icon="finger-print"
            title="Verrouillage Face ID / empreinte"
            subtitle="Demandé à chaque ouverture de l'app"
            right={<Switch value={biometricEnabled} onValueChange={(v) => void setBiometricEnabled(v)} />}
          />
        )}
      </Card>

      <Card>
        <ListRow
          icon="log-out-outline"
          title="Se déconnecter"
          destructive
          onPress={() =>
            Alert.alert("Se déconnecter ?", "Vous ne recevrez plus les notifications sur cet appareil.", [
              { text: "Annuler", style: "cancel" },
              { text: "Se déconnecter", style: "destructive", onPress: () => void signOut() },
            ])
          }
        />
      </Card>
      <AppText variant="caption" color={t.subtle} style={{ textAlign: "center" }}>Serveur : {API_URL}</AppText>
    </ScrollView>
  );
}
