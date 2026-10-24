import { Pressable, View } from "react-native";
import { displayName } from "@/lib/addresses";
import { formatListDate } from "@/lib/format";
import type { MessageSummary } from "@/lib/types";
import { useTheme } from "./theme";
import { AppText, Avatar, Badge, Icon } from "./ui";

export function MessageRow({ m, onPress }: { m: MessageSummary; onPress: () => void }) {
  const t = useTheme();
  const incoming = m.direction === "in";
  const unread = incoming && !m.read;
  const recipients = [...m.to, ...m.cc, ...m.bcc];
  const who = incoming ? m.from : recipients[0];
  const names = incoming ? displayName(m.from) : recipients.map(displayName).join(", ");
  const r = m.result;
  const bounced = (r?.permanent_bounces.length ?? 0) + (r?.suppressed_recipients?.length ?? 0);
  const queuedOnly = r && r.queued.length > 0 && r.delivered.length === 0;
  const date = m.sentAt ?? m.updatedAt;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: pressed ? t.surface2 : t.surface,
        borderBottomWidth: 0.5,
        borderBottomColor: t.border,
      })}
    >
      <View>
        <Avatar label={who ? who.name || who.address : "?"} />
        {unread && (
          <View style={{ position: "absolute", left: -6, top: 16, width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent }} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AppText numberOfLines={1} style={{ flex: 1, fontWeight: unread ? "700" : "500" }}>
            {!incoming && <AppText color={t.muted}>À : </AppText>}
            {names || "aucun destinataire"}
          </AppText>
          <AppText variant="caption" color={unread ? t.accent : t.subtle} style={{ fontWeight: unread ? "700" : "400" }}>
            {formatListDate(date)}
          </AppText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <AppText variant="small" numberOfLines={1} style={{ flex: 1, fontWeight: unread ? "600" : "500" }}>
            {m.subject || "(sans objet)"}
          </AppText>
          {m.attachmentCount > 0 && <Icon name="attach" size={15} color={t.subtle} />}
          {m.starred && <Icon name="star" size={14} color={t.orange} />}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {m.folder === "drafts" && <Badge label={m.error ? "Échec d'envoi" : "Brouillon"} tone={m.error ? "danger" : "neutral"} />}
          {bounced > 0 && <Badge label="Rejeté" tone="danger" />}
          {queuedOnly && <Badge label="En attente" tone="warning" />}
          <AppText variant="small" color={t.muted} numberOfLines={1} style={{ flex: 1 }}>
            {m.snippet || "—"}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}
