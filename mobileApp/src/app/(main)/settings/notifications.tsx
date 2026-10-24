import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  Switch,
  View,
} from "react-native";
import { useTheme } from "@/components/theme";
import { AppText, Badge, Button, Card, Icon, ListRow } from "@/components/ui";
import { api } from "@/lib/api";
import { APP_NAME } from "@/lib/config";
import {
  getEasProjectId,
  getPushToken,
  isPushEnabled,
  registerForPush,
  sendTestNotification,
  unregisterPush,
} from "@/lib/push";
import { useSession } from "@/lib/session";

type PushStatus = {
  count: number;
  devices: { platform: string; updatedAt: string }[];
};

export default function NotificationsScreen() {
  const t = useTheme();
  const { domain, user } = useSession();
  const queryClient = useQueryClient();

  const [permissionStatus, setPermissionStatus] = useState<string>("checking");
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const devicesQuery = useQuery({
    queryKey: ["push-status"],
    queryFn: () => api<PushStatus>("/api/push"),
  });

  const checkStatus = async () => {
    try {
      const perm = await Notifications.getPermissionsAsync();
      setPermissionStatus(perm.status);
      const isActivelyEnabled = await isPushEnabled();
      setEnabled(isActivelyEnabled);
      const curToken = await getPushToken();
      setToken(curToken);
    } catch {
      setPermissionStatus("unknown");
    }
  };

  useEffect(() => {
    void checkStatus();
  }, []);

  const togglePush = async (enable: boolean) => {
    setBusy(true);
    try {
      if (enable) {
        if (!Device.isDevice) {
          Alert.alert(
            "Simulateur détecté",
            "Les notifications push réelles d'Apple (APNs) ne fonctionnent que sur un iPhone physique. Cependant, vous pouvez tester les notifications locales avec le bouton ci-dessous.",
          );
        }
        const perm = await Notifications.getPermissionsAsync();
        if (!perm.granted) {
          const req = await Notifications.requestPermissionsAsync();
          setPermissionStatus(req.status);
          if (!req.granted) {
            Alert.alert(
              "Autorisation requise",
              `Pour recevoir des notifications, autorisez ${APP_NAME} dans les Réglages de votre appareil.`,
              [
                { text: "Annuler", style: "cancel" },
                { text: "Ouvrir les Réglages", onPress: () => void Linking.openSettings() },
              ],
            );
            setBusy(false);
            return;
          }
        }
        const registered = await registerForPush({ force: true });
        setEnabled(true);
        setToken(registered);
        await queryClient.invalidateQueries({ queryKey: ["push-status"] });
        Alert.alert("Succès", "Les notifications push ont été activées sur cet appareil.");
      } else {
        await unregisterPush();
        setEnabled(false);
        setToken(null);
        await queryClient.invalidateQueries({ queryKey: ["push-status"] });
        Alert.alert("Désactivé", "Les notifications push ont été désactivées pour cet appareil.");
      }
    } catch (err) {
      Alert.alert("Erreur", (err as Error).message);
    } finally {
      await checkStatus();
      setBusy(false);
    }
  };

  const handleTestNotification = async () => {
    setTesting(true);
    try {
      await sendTestNotification();
    } catch (err) {
      Alert.alert("Erreur", (err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const isGranted = permissionStatus === "granted";
  const easProjectId = getEasProjectId();

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={devicesQuery.isRefetching}
          onRefresh={() => {
            void checkStatus();
            void devicesQuery.refetch();
          }}
        />
      }
    >
      <Stack.Screen options={{ title: "Notifications" }} />

      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <AppText variant="heading">Notifications push</AppText>
            <AppText variant="small" color={t.muted}>
              Alertes instantanées à l&apos;arrivée d&apos;un nouvel e-mail
            </AppText>
          </View>
          {busy ? (
            <ActivityIndicator />
          ) : (
            <Switch
              value={enabled}
              onValueChange={(val) => void togglePush(val)}
            />
          )}
        </View>

        {!isGranted && permissionStatus !== "checking" && (
          <View
            style={{
              padding: 12,
              borderRadius: 10,
              backgroundColor: t.warningSoft,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Icon name="alert-circle-outline" color={t.warning} size={22} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="caption" color={t.warning} style={{ fontWeight: "600" }}>
                Autorisation système non accordée
              </AppText>
              <AppText variant="caption" color={t.text}>
                Activez les notifications dans les réglages iOS pour être alerté en direct.
              </AppText>
            </View>
            <Button
              title="Réglages"
              variant="secondary"
              onPress={() => void Linking.openSettings()}
              style={{ minHeight: 36, paddingHorizontal: 12 }}
            />
          </View>
        )}
      </Card>

      <Card>
        <ListRow
          icon="phone-portrait-outline"
          title="Appareil"
          subtitle={Device.isDevice ? `${Device.modelName || "iPhone physique"}` : "Simulateur iOS / Android"}
          right={<Badge label={Device.isDevice ? "Physique" : "Simulateur"} tone={Device.isDevice ? "success" : "warning"} />}
        />
        <ListRow
          icon="shield-checkmark-outline"
          title="Autorisation iOS"
          subtitle={isGranted ? "Autorisées avec son et bannière" : "Non autorisées"}
          right={<Badge label={isGranted ? "Active" : "Inactif"} tone={isGranted ? "success" : "danger"} />}
        />
        <ListRow
          icon="cloud-done-outline"
          title="Service Expo EAS"
          subtitle={easProjectId ? `Projet lié (${easProjectId.slice(0, 8)}…)` : "Non configuré"}
          right={<Badge label={easProjectId ? "Connecté" : "Erreur"} tone={easProjectId ? "success" : "danger"} />}
        />
        {enabled && token ? (
          <ListRow
            icon="key-outline"
            title="Jeton push"
            subtitle={`${token.slice(0, 24)}…`}
            right={<Badge label="Enregistré" tone="accent" />}
          />
        ) : (
          <ListRow
            icon="key-outline"
            title="Jeton push"
            subtitle="Aucun jeton actif pour cet appareil"
            right={<Badge label="Désactivé" tone="neutral" />}
          />
        )}
      </Card>

      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ gap: 4 }}>
          <AppText variant="heading">Tester les alertes</AppText>
          <AppText variant="small" color={t.muted}>
            Vérifiez immédiatement l&apos;affichage de la bannière et le son sur cet appareil.
          </AppText>
        </View>
        <Button
          title="Envoyer une notification test"
          icon="notifications-circle-outline"
          variant="secondary"
          onPress={() => void handleTestNotification()}
          loading={testing}
        />
      </Card>

      <Card style={{ padding: 16, gap: 10 }}>
        <AppText variant="heading">Appareils enregistrés sur votre compte</AppText>
        <AppText variant="small" color={t.muted}>
          Tous vos appareils connectés reçoivent les alertes pour vos boîtes @{domain}.
        </AppText>
        {devicesQuery.isPending ? (
          <ActivityIndicator style={{ marginVertical: 8 }} />
        ) : devicesQuery.data?.devices && devicesQuery.data.devices.length > 0 ? (
          <View style={{ gap: 8, marginTop: 4 }}>
            {devicesQuery.data.devices.map((d, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 6,
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: t.border,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Icon name={d.platform === "ios" ? "logo-apple" : "logo-android"} color={t.muted} size={18} />
                  <AppText variant="small" style={{ textTransform: "capitalize" }}>{d.platform}</AppText>
                </View>
                <AppText variant="caption" color={t.subtle}>
                  {new Date(d.updatedAt).toLocaleDateString()} à {new Date(d.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </AppText>
              </View>
            ))}
          </View>
        ) : (
          <AppText variant="caption" color={t.subtle}>
            Aucun appareil enregistré sur le serveur. Activez le bouton ci-dessus pour enregistrer cet appareil.
          </AppText>
        )}
      </Card>

      <View style={{ paddingHorizontal: 4 }}>
        <AppText variant="caption" color={t.subtle} style={{ textAlign: "center", lineHeight: 18 }}>
          Connecté en tant que {user?.email} ({user?.role === "admin" ? "Administrateur" : "Membre"}).
          Les notifications sont envoyées dès que le Worker Cloudflare reçoit un e-mail sur vos boîtes autorisées.
        </AppText>
      </View>
    </ScrollView>
  );
}
