import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Stack, router } from "expo-router";
import { useEffect } from "react";
import { useTheme } from "@/components/theme";
import { registerForPush } from "@/lib/push";
import { useSession } from "@/lib/session";

export default function MainLayout() {
  const t = useTheme();
  const { domain, chooseDomain } = useSession();
  const queryClient = useQueryClient();

  // Notifications : enregistrement de l'appareil, rafraîchissement à la réception, ouverture du message au toucher
  useEffect(() => {
    registerForPush().catch((err) => console.warn("Notifications indisponibles", err));
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
    });
    const opened = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data as { messageId?: string; domain?: string };
      if (!data.messageId) return;
      if (data.domain && data.domain !== domain) await chooseDomain(data.domain);
      router.push({ pathname: "/message/[id]", params: { id: data.messageId } });
    });
    return () => {
      received.remove();
      opened.remove();
    };
  }, [queryClient, domain, chooseDomain]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.surface },
        headerTintColor: t.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: t.bg },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="message/[id]" options={{ title: "" }} />
      <Stack.Screen name="compose" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="settings/index" options={{ title: "Réglages" }} />
      <Stack.Screen name="settings/account" options={{ title: "Mon compte" }} />
      <Stack.Screen name="settings/notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="settings/signatures" options={{ title: "Signatures" }} />
      <Stack.Screen name="settings/signature" options={{ title: "Signature", presentation: "modal" }} />
      <Stack.Screen name="settings/contacts" options={{ title: "Contacts" }} />
      <Stack.Screen name="settings/addresses" options={{ title: "Adresses d'envoi" }} />
      <Stack.Screen name="settings/users" options={{ title: "Utilisateurs" }} />
      <Stack.Screen name="settings/user" options={{ title: "Compte", presentation: "modal" }} />
    </Stack>
  );
}
