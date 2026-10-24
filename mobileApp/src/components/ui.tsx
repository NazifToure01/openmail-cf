import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { radius, useTheme } from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({ name, size = 20, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.muted} style={style} />;
}

export function AppText({
  children,
  variant = "body",
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: "title" | "heading" | "body" | "small" | "caption";
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const t = useTheme();
  const base: TextStyle =
    variant === "title"
      ? { fontSize: 24, fontWeight: "700", letterSpacing: -0.4 }
      : variant === "heading"
        ? { fontSize: 17, fontWeight: "600" }
        : variant === "small"
          ? { fontSize: 14 }
          : variant === "caption"
            ? { fontSize: 12 }
            : { fontSize: 15 };
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: color ?? t.text }, base, style]}>
      {children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = variant === "primary" ? t.accent : variant === "danger" ? t.danger : variant === "secondary" ? t.surface : "transparent";
  const fg = variant === "primary" ? t.accentFg : variant === "danger" ? "#FFFFFF" : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "secondary" && { borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 15, fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ name, onPress, label, color, size = 22, style, ...rest }: { name: IconName; label: string; color?: string; size?: number } & PressableProps) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={(state) => [styles.iconButton, state.pressed && { backgroundColor: t.surface2 }, typeof style === "function" ? style(state) : style]}
      {...rest}
    >
      <Ionicons name={name} size={size} color={color ?? t.text} />
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: { label?: string; hint?: string } & TextInputProps) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label && <AppText variant="small" color={t.muted} style={{ fontWeight: "500" }}>{label}</AppText>}
      <TextInput
        placeholderTextColor={t.subtle}
        // Pas de correction automatique sur les adresses, URL et mots de passe
        autoCorrect={!(props.secureTextEntry || props.keyboardType === "email-address" || props.keyboardType === "url" || props.autoCapitalize === "none")}
        {...props}
        style={[
          styles.input,
          { backgroundColor: t.surface, borderColor: t.border, color: t.text },
          props.multiline && { minHeight: 90, textAlignVertical: "top", paddingTop: 10 },
          props.style,
        ]}
      />
      {hint && <AppText variant="caption" color={t.subtle}>{hint}</AppText>}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>{children}</View>;
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" | "accent" }) {
  const t = useTheme();
  const map = {
    neutral: [t.surface2, t.muted],
    success: [t.successSoft, t.success],
    warning: [t.warningSoft, t.warning],
    danger: [t.dangerSoft, t.danger],
    accent: [t.accentSoft, t.accent],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

/** Pastille avec les initiales, couleur stable dérivée du texte (comme sur le web) */
export function Avatar({ label, size = 40 }: { label: string; size?: number }) {
  const initials = label
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `hsla(${hue}, 70%, 50%, 0.16)`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: `hsl(${hue}, 60%, 42%)`, fontWeight: "700", fontSize: size * 0.36 }}>{initials || "?"}</Text>
    </View>
  );
}

export function Empty({ icon, title, hint, action }: { icon: IconName; title: string; hint?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: 24, gap: 8 }}>
      <Icon name={icon} size={30} color={t.subtle} />
      <AppText variant="heading" style={{ textAlign: "center" }}>{title}</AppText>
      {hint && <AppText variant="small" color={t.muted} style={{ textAlign: "center" }}>{hint}</AppText>}
      {action}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  destructive,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  destructive?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surface2 }]}>
      {icon && <Icon name={icon} color={destructive ? t.danger : t.muted} />}
      <View style={{ flex: 1 }}>
        <AppText color={destructive ? t.danger : t.text}>{title}</AppText>
        {subtitle && <AppText variant="caption" color={t.muted} numberOfLines={2}>{subtitle}</AppText>}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={t.subtle} /> : null)}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 52 },
});
