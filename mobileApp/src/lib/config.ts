import Constants from "expo-constants";

/** Nom affiché de l'app (champ « name » de app.json) */
export const APP_NAME = Constants.expoConfig?.name || "OpenMail CF";

/**
 * Adresse du serveur OpenMail CF (ex. https://mail.example.com) : EXPO_PUBLIC_API_URL
 * (fichier mobileApp/.env ou variables EAS), sinon « extra.apiUrl » de app.json.
 * En développement, on peut pointer vers un serveur local,
 * ex. http://192.168.1.28:3300 (l'adresse IP de votre Mac sur le Wi-Fi).
 */
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  ""
).replace(/\/+$/, "");
