import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, TextInput, View } from "react-native";
import { radius, useTheme } from "@/components/theme";
import { AppText, Avatar, Empty, Icon, IconButton } from "@/components/ui";
import { api } from "@/lib/api";
import { useContacts } from "@/lib/queries";

export default function ContactsScreen() {
  const t = useTheme();
  const contacts = useContacts();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const list = (contacts.data ?? []).filter((c) => !q || c.address.includes(q.toLowerCase()) || (c.name ?? "").toLowerCase().includes(q.toLowerCase()));

  const remove = (address: string) =>
    Alert.alert(`Supprimer ${address} ?`, undefined, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await api(`/api/contacts?address=${encodeURIComponent(address)}`, { method: "DELETE" });
          await queryClient.invalidateQueries({ queryKey: ["contacts"] });
        },
      },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: t.surface, borderRadius: radius.md, paddingHorizontal: 12, height: 44, borderWidth: 0.5, borderColor: t.border }}>
          <Icon name="search" size={17} color={t.subtle} />
          <TextInput value={q} onChangeText={setQ} placeholder="Rechercher un contact" placeholderTextColor={t.subtle} autoCapitalize="none" style={{ flex: 1, color: t.text, fontSize: 16 }} />
        </View>
      </View>
      {contacts.isPending ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(c) => c.address}
          ListEmptyComponent={<Empty icon="people-outline" title={q ? "Aucun résultat" : "Aucun contact"} hint="Les destinataires sont ajoutés automatiquement après chaque envoi." />}
          renderItem={({ item }) => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: t.surface, borderBottomWidth: 0.5, borderBottomColor: t.border }}>
              <Avatar label={item.name || item.address} size={36} />
              <View style={{ flex: 1 }}>
                <AppText numberOfLines={1}>{item.name || item.address}</AppText>
                {item.name && <AppText variant="caption" color={t.muted}>{item.address}</AppText>}
              </View>
              <IconButton name="trash-outline" label="Supprimer" onPress={() => remove(item.address)} />
            </View>
          )}
        />
      )}
    </View>
  );
}
