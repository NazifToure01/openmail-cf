import { useQueryClient } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmailView } from "@/components/email-view";
import { radius, useTheme } from "@/components/theme";
import { AppText, Avatar, Badge, Empty, Icon, IconButton, type IconName } from "@/components/ui";
import { absoluteUrl, api, authHeaders } from "@/lib/api";
import { formatBytes, formatFullDate } from "@/lib/format";
import { useMessage } from "@/lib/queries";
import { useSession } from "@/lib/session";
import type { Address, AttachmentMeta, Message } from "@/lib/types";

export default function MessageScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useSession();
  const queryClient = useQueryClient();
  const message = useMessage(id);
  const m = message.data;

  // Message reçu non lu : marqué comme lu à l'ouverture
  useEffect(() => {
    if (m && m.direction === "in" && !m.read) {
      api(`/api/messages/${m.id}`, { method: "PATCH", json: { read: true } })
        .then(() => queryClient.invalidateQueries({ queryKey: ["messages"] }))
        .catch(() => {});
    }
  }, [m, queryClient]);

  const patch = async (body: Record<string, unknown>, done?: string) => {
    if (!m) return;
    await api(`/api/messages/${m.id}`, { method: "PATCH", json: body });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["messages"] }),
      queryClient.invalidateQueries({ queryKey: ["message", m.id] }),
    ]);
    if (done) router.back();
  };

  const remove = () => {
    if (!m) return;
    Alert.alert(
      m.folder === "drafts" ? "Supprimer ce brouillon ?" : "Supprimer définitivement ?",
      m.folder === "drafts" ? undefined : "Cette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            await api(`/api/messages/${m.id}`, { method: "DELETE" });
            await queryClient.invalidateQueries({ queryKey: ["messages"] });
            router.back();
          },
        },
      ],
    );
  };

  // Accès protégé : le React Compiler lit les dépendances (m.id) dès le rendu, même pendant le chargement
  const messageId = m?.id;
  const compose = (mode: string) => {
    if (messageId) router.push({ pathname: "/compose", params: { mode, id: messageId } });
  };

  if (message.isPending) return <ActivityIndicator style={{ marginTop: 60 }} />;
  if (message.error || !m) return <Empty icon="alert-circle-outline" title="Message introuvable" hint={(message.error as Error | null)?.message} />;

  const incoming = m.direction === "in";
  const inTrash = m.folder === "trash";
  const visible = m.attachments.filter((a) => !a.inline);
  const date = m.sentAt ?? m.updatedAt;

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {!inTrash && (
                <IconButton name={m.starred ? "star" : "star-outline"} color={m.starred ? t.orange : t.text} label="Suivre" onPress={() => void patch({ starred: !m.starred })} />
              )}
              {incoming && !inTrash && <IconButton name="mail-unread-outline" label="Marquer comme non lu" onPress={() => void patch({ read: false }, "back")} />}
              {inTrash ? (
                <>
                  <IconButton name="arrow-undo-outline" label="Restaurer" onPress={() => void patch({ action: "restore" }, "back")} />
                  <IconButton name="trash" color={t.danger} label="Supprimer définitivement" onPress={remove} />
                </>
              ) : (
                <IconButton name="trash-outline" label="Corbeille" onPress={() => void patch({ action: "trash" }, "back")} />
              )}
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 + insets.bottom, gap: 14 }}>
        <AppText variant="title">{m.subject || "(sans objet)"}</AppText>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Avatar label={m.from.name || m.from.address} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText style={{ fontWeight: "600" }}>{m.from.name || m.from.address}</AppText>
            {m.from.name && <AppText variant="caption" color={t.muted}>{m.from.address}</AppText>}
            <AddressLine label="À" list={m.to} />
            <AddressLine label="Cc" list={m.cc} />
            <AddressLine label="Cci" list={m.bcc} />
            <AppText variant="caption" color={t.subtle}>{formatFullDate(date)}</AppText>
          </View>
        </View>

        {m.error && (
          <View style={{ backgroundColor: t.dangerSoft, borderRadius: radius.md, padding: 12 }}>
            <AppText variant="small" color={t.danger}>Échec du dernier envoi : {m.error}</AppText>
          </View>
        )}
        {m.result && <DeliveryStatus result={m.result} />}

        <EmailView html={m.html ?? m.bodyHtml} token={token} />

        {visible.length > 0 && (
          <View style={{ gap: 8 }}>
            <AppText variant="caption" color={t.subtle} style={{ textTransform: "uppercase", fontWeight: "600" }}>
              {visible.length} pièce{visible.length > 1 ? "s" : ""} jointe{visible.length > 1 ? "s" : ""}
            </AppText>
            {visible.map((a) => (
              <AttachmentRow key={a.id} a={a} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Actions */}
      {!inTrash && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            flexDirection: "row",
            justifyContent: "space-around",
            paddingTop: 10,
            paddingBottom: 10 + insets.bottom,
            backgroundColor: t.surface,
            borderTopWidth: 0.5,
            borderTopColor: t.border,
          }}
        >
          {m.folder === "drafts" ? (
            <Action icon="create-outline" label="Modifier" onPress={() => router.replace({ pathname: "/compose", params: { mode: "draft", id: m.id } })} />
          ) : incoming ? (
            <>
              <Action icon="arrow-undo-outline" label="Répondre" onPress={() => compose("reply")} />
              <Action icon="arrow-undo-circle-outline" label="Rép. à tous" onPress={() => compose("replyAll")} />
              <Action icon="arrow-redo-outline" label="Transférer" onPress={() => compose("forward")} />
            </>
          ) : (
            <>
              <Action icon="arrow-undo-outline" label="Relancer" onPress={() => compose("followup")} />
              <Action icon="arrow-redo-outline" label="Transférer" onPress={() => compose("forward")} />
              <Action icon="copy-outline" label="Dupliquer" onPress={() => compose("duplicate")} />
            </>
          )}
        </View>
      )}
    </>
  );
}

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ alignItems: "center", gap: 2, minWidth: 80, paddingVertical: 4 }}>
      <Icon name={icon} size={22} color={t.text} />
      <AppText variant="caption">{label}</AppText>
    </Pressable>
  );
}

function AddressLine({ label, list }: { label: string; list: Address[] }) {
  const t = useTheme();
  if (!list.length) return null;
  return (
    <AppText variant="caption" color={t.muted}>
      {label} : {list.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", ")}
    </AppText>
  );
}

function DeliveryStatus({ result }: { result: NonNullable<Message["result"]> }) {
  const groups: { list: string[]; label: string; tone: "success" | "warning" | "danger" }[] = [
    { list: result.delivered, label: "Délivré", tone: "success" as const },
    { list: result.queued, label: "En file d'attente", tone: "warning" as const },
    { list: result.permanent_bounces, label: "Rejet définitif", tone: "danger" as const },
    { list: result.suppressed_recipients ?? [], label: "Bloqué", tone: "danger" as const },
  ].filter((g) => g.list.length);
  if (!groups.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {groups.map((g) => (
        <Badge key={g.label} tone={g.tone} label={`${g.label} · ${g.list.length === 1 ? g.list[0] : `${g.list.length} destinataires`}`} />
      ))}
    </View>
  );
}

/** Téléchargement de la pièce jointe (avec la session) puis ouverture / partage */
function AttachmentRow({ a }: { a: AttachmentMeta }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const safeName = a.filename.replace(/[\\/:*?"<>|]/g, "_");
      const dest = new File(Paths.cache, `${a.id}-${safeName}`);
      if (!dest.exists) {
        const task = File.createDownloadTask(absoluteUrl(`/api/attachments/${a.id}?download`), dest, { headers: authHeaders() });
        await task.downloadAsync();
      }
      await Sharing.shareAsync(dest.uri, { mimeType: a.type, dialogTitle: a.filename });
    } catch (err) {
      Alert.alert("Ouverture impossible", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 12,
        borderRadius: radius.md,
        borderWidth: 0.5,
        borderColor: t.border,
        backgroundColor: pressed ? t.surface2 : t.surface,
      })}
    >
      <Icon name="document-attach-outline" size={22} />
      <View style={{ flex: 1 }}>
        <AppText variant="small" numberOfLines={1} style={{ fontWeight: "500" }}>{a.filename}</AppText>
        <AppText variant="caption" color={t.subtle}>{formatBytes(a.size)}</AppText>
      </View>
      {busy ? <ActivityIndicator /> : <Icon name="share-outline" size={20} />}
    </Pressable>
  );
}
