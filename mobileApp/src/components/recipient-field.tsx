import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { dedupeAddresses, displayName, isValidEmail, parseAddressList } from "@/lib/addresses";
import type { Address, Contact } from "@/lib/types";
import { useTheme } from "./theme";
import { AppText, Icon } from "./ui";

/** Champ À / Cc / Cci : puces, saisie libre (virgule, espace ou « Entrée »), suggestions de contacts */
export function RecipientField({
  label,
  value,
  onChange,
  contacts,
  single,
  autoFocus,
  right,
}: {
  label: string;
  value: Address[];
  onChange: (list: Address[]) => void;
  contacts: Contact[];
  single?: boolean;
  autoFocus?: boolean;
  right?: React.ReactNode;
}) {
  const t = useTheme();
  const [text, setText] = useState("");

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(value.map((v) => v.address));
    return contacts.filter((c) => !taken.has(c.address) && (c.address.includes(q) || (c.name ?? "").toLowerCase().includes(q))).slice(0, 5);
  }, [text, contacts, value]);

  const commit = (raw = text) => {
    const parsed = parseAddressList(raw).map((a) => {
      const known = contacts.find((c) => c.address === a.address);
      return a.name || !known?.name ? a : { ...a, name: known.name };
    });
    if (parsed.length) onChange(single ? parsed.slice(-1) : dedupeAddresses([...value, ...parsed]));
    setText("");
  };

  const pick = (c: Contact) => {
    const entry = { address: c.address, ...(c.name ? { name: c.name } : {}) };
    onChange(single ? [entry] : dedupeAddresses([...value, entry]));
    setText("");
  };

  return (
    <View style={{ borderBottomWidth: 0.5, borderBottomColor: t.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, minHeight: 48, gap: 8 }}>
        <AppText variant="small" color={t.muted} style={{ width: 44 }}>{label}</AppText>
        <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, paddingVertical: 6 }}>
          {value.map((a) => {
            const valid = isValidEmail(a.address);
            return (
              <Pressable
                key={a.address}
                onPress={() => onChange(value.filter((v) => v.address !== a.address))}
                accessibilityLabel={`Retirer ${a.address}`}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingLeft: 10, paddingRight: 6, paddingVertical: 4, backgroundColor: valid ? t.surface2 : t.dangerSoft }}
              >
                <AppText variant="small" color={valid ? t.text : t.danger} numberOfLines={1}>{displayName(a)}</AppText>
                <Icon name="close" size={14} color={valid ? t.muted : t.danger} />
              </Pressable>
            );
          })}
          {!(single && value.length) && (
            <TextInput
              value={text}
              autoFocus={autoFocus}
              onChangeText={(v) => (/[,;\s]$/.test(v) && v.trim() ? commit(v) : setText(v))}
              onSubmitEditing={() => commit()}
              onBlur={() => text.trim() && commit()}
              blurOnSubmit={false}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder={value.length ? "" : "nom@exemple.com"}
              placeholderTextColor={t.subtle}
              style={{ flexGrow: 1, minWidth: 140, color: t.text, fontSize: 16, paddingVertical: 6 }}
            />
          )}
        </View>
        {right}
      </View>
      {suggestions.length > 0 && (
        <View style={{ paddingBottom: 6 }}>
          {suggestions.map((c) => (
            <Pressable key={c.address} onPress={() => pick(c)} style={({ pressed }) => ({ paddingHorizontal: 68, paddingVertical: 10, backgroundColor: pressed ? t.surface2 : "transparent" })}>
              <AppText variant="small" style={{ fontWeight: "600" }}>{c.name || c.address}</AppText>
              {c.name && <AppText variant="caption" color={t.muted}>{c.address}</AppText>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
