import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, configureApi } from "./api";
import { APP_NAME } from "./config";
import { unregisterPush } from "./push";
import type { AppUser } from "./types";

/**
 * Session : jeton (stockage sécurisé du téléphone), utilisateur, domaine de travail,
 * et verrouillage par Face ID / empreinte à l'ouverture de l'app.
 */

const KEYS = { token: "mm.token", domain: "mm.domain", biometric: "mm.biometric" } as const;

type Status = "loading" | "signedOut" | "locked" | "signedIn";

type Session = {
  status: Status;
  /** Jeton de session (pour les images intégrées des e-mails et les téléchargements) */
  token: string | null;
  user: AppUser | null;
  domain: string | null;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  chooseDomain: (domain: string | null) => Promise<void>;
  unlock: () => Promise<boolean>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  refreshUser: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession doit être utilisé dans <SessionProvider>");
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [biometricEnabled, setBiometric] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const signingOut = useRef(false);

  const clear = useCallback(async () => {
    await Promise.all([SecureStore.deleteItemAsync(KEYS.token), SecureStore.deleteItemAsync(KEYS.domain)]);
    configureApi({ token: null, domain: null });
    setToken(null);
    setUser(null);
    setDomain(null);
    setStatus("signedOut");
  }, []);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      await unregisterPush().catch(() => {});
      await api("/api/auth/logout", { method: "POST" }).catch(() => {});
      await clear();
    } finally {
      signingOut.current = false;
    }
  }, [clear]);

  const chooseDomain = useCallback(async (next: string | null) => {
    if (next) await SecureStore.setItemAsync(KEYS.domain, next);
    else await SecureStore.deleteItemAsync(KEYS.domain);
    configureApi({ domain: next });
    setDomain(next);
  }, []);

  // Branchements du client API : session expirée → déconnexion ; domaine manquant → choix du domaine
  useEffect(() => {
    configureApi({
      onUnauthorized: () => void clear(),
      onDomainRequired: () => void chooseDomain(null),
    });
  }, [clear, chooseDomain]);

  const refreshUser = useCallback(async () => {
    const { user: me } = await api<{ user: AppUser }>("/api/auth/me");
    setUser(me);
  }, []);

  // Démarrage : jeton enregistré ? → profil, puis verrouillage biométrique si activé
  useEffect(() => {
    (async () => {
      const [token, savedDomain, bio, hasHardware, enrolled] = await Promise.all([
        SecureStore.getItemAsync(KEYS.token),
        SecureStore.getItemAsync(KEYS.domain),
        SecureStore.getItemAsync(KEYS.biometric),
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      setBiometricAvailable(hasHardware && enrolled);
      setBiometric(bio === "1");
      if (!token) return setStatus("signedOut");
      configureApi({ token, domain: savedDomain });
      setToken(token);
      setDomain(savedDomain);
      try {
        await refreshUser();
        setStatus(bio === "1" && hasHardware && enrolled ? "locked" : "signedIn");
      } catch {
        // Hors connexion : on garde la session, l'écran affichera l'erreur réseau
        setStatus(bio === "1" ? "locked" : "signedIn");
      }
    })();
  }, [refreshUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api<{ token: string; user: AppUser }>("/api/auth/login", { json: { email, password } });
    await SecureStore.setItemAsync(KEYS.token, res.token);
    configureApi({ token: res.token, domain: null });
    setToken(res.token);
    await SecureStore.deleteItemAsync(KEYS.domain);
    setDomain(null);
    setUser(res.user);
    setStatus("signedIn");
  }, []);

  const unlock = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Déverrouiller ${APP_NAME}`,
      cancelLabel: "Annuler",
      fallbackLabel: "Utiliser le code",
    });
    if (result.success) setStatus("signedIn");
    return result.success;
  }, []);

  const setBiometricEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const check = await LocalAuthentication.authenticateAsync({ promptMessage: "Activer le verrouillage biométrique" });
      if (!check.success) return;
    }
    await SecureStore.setItemAsync(KEYS.biometric, enabled ? "1" : "0");
    setBiometric(enabled);
  }, []);

  const value = useMemo<Session>(
    () => ({
      status,
      token,
      user,
      domain,
      biometricEnabled,
      biometricAvailable,
      signIn,
      signOut,
      chooseDomain,
      unlock,
      setBiometricEnabled,
      refreshUser,
    }),
    [status, token, user, domain, biometricEnabled, biometricAvailable, signIn, signOut, chooseDomain, unlock, setBiometricEnabled, refreshUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
