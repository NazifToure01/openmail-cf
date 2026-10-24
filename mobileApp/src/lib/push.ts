import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api } from "./api";
import { APP_NAME } from "./config";

/**
 * Notifications push : demande l'autorisation, récupère le jeton Expo et l'enregistre sur le serveur.
 * Nécessite un « development build » ou une version installée (pas Expo Go) et un projet EAS.
 */

const TOKEN_KEY = "mm.pushToken";
const DISABLED_KEY = "mm.pushDisabled";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function getEasProjectId(): string | undefined {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId
  );
}

export async function isPushEnabled(): Promise<boolean> {
  try {
    const disabled = await SecureStore.getItemAsync(DISABLED_KEY);
    if (disabled === "1") return false;
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    return Boolean(token);
  } catch {
    return false;
  }
}

export async function getPushToken(): Promise<string | null> {
  try {
    const disabled = await SecureStore.getItemAsync(DISABLED_KEY);
    if (disabled === "1") return null;
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function getPushPermissionStatus(): Promise<Notifications.PermissionStatus> {
  const perm = await Notifications.getPermissionsAsync();
  return perm.status;
}

export async function registerForPush(options: { force?: boolean } = {}): Promise<string | null> {
  if (!options.force) {
    const disabled = await SecureStore.getItemAsync(DISABLED_KEY).catch(() => null);
    if (disabled === "1") {
      // L'utilisateur a explicitement désactivé les notifications
      return null;
    }
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Nouveaux e-mails",
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: "#F5A524",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? "granted" : (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;

  if (!Device.isDevice) {
    // Les simulateurs ne peuvent pas s'enregistrer auprès des serveurs APNs/FCM Expo
    return null;
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    console.warn("Notifications push : projet EAS non configuré (eas init)");
    return null;
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api("/api/push", { json: { token, platform: Platform.OS } });
  await SecureStore.deleteItemAsync(DISABLED_KEY).catch(() => {});
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  return token;
}

/** Désactive les notifications de cet appareil */
export async function unregisterPush() {
  await SecureStore.setItemAsync(DISABLED_KEY, "1").catch(() => {});
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  await api("/api/push", { method: "DELETE", json: { token } }).catch(() => {});
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

/** Teste une notification locale immédiate */
export async function sendTestNotification() {
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) {
    const requested = await Notifications.requestPermissionsAsync();
    if (!requested.granted) {
      throw new Error("L'autorisation de notification n'a pas été accordée.");
    }
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: APP_NAME,
      body: "Test réussi ! Vous recevrez une alerte pour chaque nouvel e-mail reçu.",
      sound: true,
      badge: 1,
    },
    trigger: null,
  });
}
