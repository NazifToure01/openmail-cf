import { router, useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MessageRow } from "@/components/message-row";
import { radius, useTheme } from "@/components/theme";
import { AppText, Empty, Icon, IconButton } from "@/components/ui";
import { api } from "@/lib/api";
import { FOLDERS, useConfig, useMessages, type MailFolder } from "@/lib/queries";
import { useSession } from "@/lib/session";

const MAILBOX_KEY = (domain: string) => `mm.mailbox.${domain.replace(/[^a-z0-9.]/gi, "_")}`;

export default function MailboxScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { domain, user } = useSession();
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [mailbox, setMailbox] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [picker, setPicker] = useState(false);
  const config = useConfig();
  const list = useMessages(folder, mailbox, search);

  // Boîte mémorisée par domaine
  useEffect(() => {
    if (!domain) return;
    SecureStore.getItemAsync(MAILBOX_KEY(domain)).then((v) => setMailbox(v ?? ""));
  }, [domain]);
  const chooseMailbox = (value: string) => {
    setMailbox(value);
    setPicker(false);
    if (domain) void SecureStore.setItemAsync(MAILBOX_KEY(domain), value);
  };

  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Nouveaux e-mails et statuts de remise : à l'ouverture de l'écran, puis toutes les 60 s
  const sync = useCallback(async () => {
    const [inbox, delivery] = await Promise.all([
      config.data?.inboxConfigured ? api<{ imported: number }>("/api/inbox/sync", { method: "POST" }).catch(() => null) : null,
      api<{ updated: number }>("/api/delivery/sync", { method: "POST" }).catch(() => null),
    ]);
    if ((inbox?.imported ?? 0) > 0 || (delivery?.updated ?? 0) > 0) {
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
    }
  }, [config.data?.inboxConfigured, queryClient]);

  useFocusEffect(
    useCallback(() => {
      void sync();
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
      const id = setInterval(() => void sync(), 60_000);
      return () => clearInterval(id);
    }, [sync, queryClient]),
  );

  const refresh = async () => {
    await sync();
    await list.refetch();
  };

  const counts = list.data?.counts;
  const mailboxes = list.data?.mailboxes ?? [];
  const current = mailboxes.find((b) => b.address === mailbox);

  const open = (id: string, isDraft: boolean) =>
    isDraft ? router.push({ pathname: "/compose", params: { mode: "draft", id } }) : router.push({ pathname: "/message/[id]", params: { id } });

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.surface }}>
      {/* En-tête : domaine + boîte, réglages */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4, gap: 4 }}>
        <Pressable
          onPress={() => setPicker(true)}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 6, paddingVertical: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Choisir la boîte"
        >
          <View style={{ flex: 1 }}>
            <AppText variant="title" numberOfLines={1}>
              {FOLDERS.find((f) => f.id === folder)?.label}
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <AppText variant="small" color={t.muted} numberOfLines={1}>
                {mailbox ? current?.name || mailbox : `Toutes les boîtes · @${domain}`}
              </AppText>
              <Icon name="chevron-down" size={14} />
            </View>
          </View>
        </Pressable>
        <IconButton name="settings-outline" label="Réglages" onPress={() => router.push("/settings")} />
      </View>

      {/* Dossiers */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }} style={{ flexGrow: 0 }}>
        {FOLDERS.map((f) => {
          const active = f.id === folder;
          const count = f.id === "inbox" ? counts?.unread : f.id === "drafts" ? counts?.drafts : undefined;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFolder(f.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                height: 34,
                borderRadius: radius.pill,
                backgroundColor: active ? t.accent : t.surface2,
              }}
            >
              <Icon name={f.icon} size={15} color={active ? t.accentFg : t.muted} />
              <AppText variant="small" color={active ? t.accentFg : t.text} style={{ fontWeight: active ? "600" : "500" }}>
                {f.label}
                {count ? ` · ${count}` : ""}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Recherche */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: t.surface2, borderRadius: radius.md, paddingHorizontal: 12, height: 40 }}>
          <Icon name="search" size={17} color={t.subtle} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher (destinataire, objet, contenu…)"
            placeholderTextColor={t.subtle}
            returnKeyType="search"
            style={{ flex: 1, color: t.text, fontSize: 15 }}
          />
          {query ? <IconButton name="close-circle" size={18} label="Effacer" onPress={() => setQuery("")} /> : null}
        </View>
      </View>

      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {list.isPending ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : list.error ? (
          <Empty icon="cloud-offline-outline" title="Chargement impossible" hint={(list.error as Error).message} />
        ) : (
          <FlatList
            data={list.data.messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageRow m={item} onPress={() => open(item.id, item.folder === "drafts")} />}
            refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={refresh} tintColor={t.muted} />}
            contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
            ListEmptyComponent={
              <Empty
                icon={folder === "inbox" ? "mail-open-outline" : "file-tray-outline"}
                title={search ? "Aucun résultat" : folder === "inbox" ? "Aucun message reçu" : "Aucun message"}
                hint={mailbox ? `dans la boîte ${mailbox}` : undefined}
              />
            }
          />
        )}
      </View>

      {/* Écrire */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nouveau message"
        onPress={() => router.push({ pathname: "/compose", params: { mode: "new", mailbox } })}
        style={({ pressed }) => ({
          position: "absolute",
          right: 20,
          bottom: 24 + insets.bottom,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 20,
          height: 56,
          borderRadius: 28,
          backgroundColor: t.accent,
          opacity: pressed ? 0.9 : 1,
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        })}
      >
        <Icon name="create-outline" color={t.accentFg} />
        <AppText color={t.accentFg} style={{ fontWeight: "700" }}>Écrire</AppText>
      </Pressable>

      {/* Choix de la boîte */}
      <Modal visible={picker} transparent animationType="fade" onRequestClose={() => setPicker(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={() => setPicker(false)}>
          <Pressable style={{ backgroundColor: t.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 12, maxHeight: "70%" }}>
            <AppText variant="heading" style={{ padding: 16 }}>
              Boîte · @{domain}
            </AppText>
            <ScrollView>
              {[{ address: "", label: "Toutes les boîtes", unread: mailboxes.reduce((n, b) => n + b.unread, 0) }, ...mailboxes.map((b) => ({ address: b.address, label: b.name || b.address, unread: b.unread }))].map((o) => (
                <Pressable
                  key={o.address || "all"}
                  onPress={() => chooseMailbox(o.address)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    backgroundColor: o.address === mailbox ? t.accentSoft : pressed ? t.surface2 : "transparent",
                  })}
                >
                  <Icon name={o.address ? "at" : "layers-outline"} color={o.address === mailbox ? t.accent : t.muted} />
                  <View style={{ flex: 1 }}>
                    <AppText numberOfLines={1}>{o.label}</AppText>
                    {o.address && o.label !== o.address && <AppText variant="caption" color={t.muted}>{o.address}</AppText>}
                  </View>
                  {o.unread > 0 && (
                    <View style={{ backgroundColor: t.accent, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 }}>
                      <AppText variant="caption" color={t.accentFg} style={{ fontWeight: "700" }}>{o.unread}</AppText>
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>
            {user?.role === "admin" || (user?.access.length ?? 0) > 1 ? (
              <Pressable onPress={() => { setPicker(false); router.push("/settings"); }} style={{ padding: 16 }}>
                <AppText variant="small" color={t.accent}>Changer de domaine dans les réglages</AppText>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
