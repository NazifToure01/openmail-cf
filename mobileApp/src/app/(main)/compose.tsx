import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { EmailView } from "@/components/email-view";
import { RecipientField } from "@/components/recipient-field";
import { RichEditor, type RichEditorHandle } from "@/components/rich-editor";
import { radius, useTheme } from "@/components/theme";
import { AppText, Button, Icon, IconButton } from "@/components/ui";
import { LOCAL_PART_RE, MAX_MESSAGE_BYTES, MAX_RECIPIENTS, isValidEmail } from "@/lib/addresses";
import { ApiError, api } from "@/lib/api";
import { escapeHtml, extractEmailContent, formatBytes, formatFullDate, htmlToPlain, withPrefix } from "@/lib/format";
import { useContacts, useIdentities, useMessage, useSignatures } from "@/lib/queries";
import { useSession } from "@/lib/session";
import type { Address, AttachmentMeta, ComposeInput, Identity, LibraryImage, Message, MessageSummary } from "@/lib/types";

type Mode = "new" | "reply" | "replyAll" | "forward" | "followup" | "duplicate" | "draft";

type Draft = {
  draftId: string | null;
  from: Address;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo: Address | null;
  subject: string;
  bodyHtml: string;
  signatureId: string | null;
  quotedHtml: string | null;
  attachments: AttachmentMeta[];
  inReplyTo: string | null;
  references: string | null;
  error?: string;
};

const ATTACHMENT_HINT = /pi[eè]ces?[ -]jointes?|ci-joint|en pj\b|attached|attachment/i;

function quoteFor(m: Message, kind: "reply" | "forward") {
  const who = escapeHtml(m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address);
  const content = extractEmailContent(m.html ?? m.bodyHtml);
  if (kind === "reply") return `<p>Le ${escapeHtml(formatFullDate(m.sentAt ?? m.updatedAt))}, ${who} a écrit :</p><blockquote>${content}</blockquote>`;
  const line = (label: string, list: Address[]) =>
    list.length ? `${label} : ${escapeHtml(list.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", "))}<br>` : "";
  return `<p>---------- Message transféré ----------<br>${line("De", [m.from])}Date : ${escapeHtml(formatFullDate(m.sentAt ?? m.updatedAt))}<br>Objet : ${escapeHtml(m.subject)}<br>${line("À", m.to)}${line("Cc", m.cc)}</p><blockquote>${content}</blockquote>`;
}

/** Adresses depuis lesquelles l'utilisateur peut écrire sur ce domaine */
function useFromChoices() {
  const { domain, user } = useSession();
  const identities = useIdentities();
  const access = useMemo(
    () => (user?.role === "admin" ? ("*" as const) : (user?.access.find((a) => a.domain === domain)?.mailboxes ?? [])),
    [user, domain],
  );
  const ids = useMemo(() => identities.data?.identities ?? [], [identities.data]);
  const fromChoices: Address[] = useMemo(() => {
    const list: Address[] = ids.map((i) => ({ address: i.address, ...(i.name ? { name: i.name } : {}) }));
    if (access !== "*") for (const a of access) if (!list.some((x) => x.address === a)) list.push({ address: a });
    return list;
  }, [ids, access]);
  const identityFor = useCallback((address: string): Identity | undefined => ids.find((i) => i.address === address), [ids]);
  return { access, ids, fromChoices, identityFor, ready: identities.isSuccess };
}

/** Prépare le brouillon selon le mode (nouveau, réponse, transfert…) */
function buildDraft(args: {
  mode: Mode;
  m: Message | undefined;
  ids: Identity[];
  fromChoices: Address[];
  identityFor: (address: string) => Identity | undefined;
  mailbox: string | undefined;
  domain: string | null;
}): Draft {
  const { mode, m, ids, fromChoices, identityFor, mailbox, domain } = args;
  const def = ids.find((i) => i.isDefault) ?? ids[0];
  const fromBox = mailbox ? identityFor(mailbox) ?? { address: mailbox, name: "" } : undefined;
  const defaultFrom: Address = fromBox
    ? { address: fromBox.address, ...(fromBox.name ? { name: fromBox.name } : {}) }
    : def
      ? { address: def.address, ...(def.name ? { name: def.name } : {}) }
      : fromChoices[0] ?? { address: "" };
  const base: Draft = {
    draftId: null,
    from: defaultFrom,
    to: [],
    cc: [],
    bcc: [],
    replyTo: null,
    subject: "",
    bodyHtml: "",
    signatureId: identityFor(defaultFrom.address)?.signatureId ?? null,
    quotedHtml: null,
    attachments: [],
    inReplyTo: null,
    references: null,
  };
  if (!m) return base;
  const own = m.deliveredTo ? { address: m.deliveredTo } : [...m.to, ...m.cc].find((a) => a.address.endsWith(`@${domain}`));
  const ownIdentity = own ? identityFor(own.address) : undefined;
  const replyFrom: Address = ownIdentity ? { address: ownIdentity.address, ...(ownIdentity.name ? { name: ownIdentity.name } : {}) } : own ?? defaultFrom;
  const threading = { inReplyTo: m.messageId ?? null, references: [m.references, m.messageId].filter(Boolean).join(" ") || null };
  if (mode === "draft") {
    return { ...base, draftId: m.id, from: m.from, to: m.to, cc: m.cc, bcc: m.bcc, replyTo: m.replyTo, subject: m.subject, bodyHtml: m.bodyHtml, signatureId: m.signatureId, quotedHtml: m.quotedHtml, attachments: m.attachments, inReplyTo: m.inReplyTo ?? null, references: m.references ?? null, error: m.error };
  }
  if (mode === "reply" || mode === "replyAll") {
    const to = [m.replyTo ?? m.from];
    const skip = new Set([...to.map((a) => a.address), replyFrom.address]);
    const cc = mode === "replyAll" ? [...m.to, ...m.cc].filter((a) => !skip.has(a.address) && (skip.add(a.address), true)) : [];
    return { ...base, from: replyFrom, to, cc, subject: withPrefix("Re", m.subject), signatureId: identityFor(replyFrom.address)?.signatureId ?? base.signatureId, quotedHtml: quoteFor(m, "reply"), ...threading };
  }
  if (mode === "forward") {
    const from = m.direction === "in" ? replyFrom : m.from;
    return { ...base, from, subject: withPrefix("Tr", m.subject), signatureId: identityFor(from.address)?.signatureId ?? base.signatureId, quotedHtml: quoteFor(m, "forward"), attachments: m.attachments };
  }
  if (mode === "followup") {
    return { ...base, from: m.from, to: m.to, cc: m.cc, replyTo: m.replyTo, subject: withPrefix("Re", m.subject), signatureId: identityFor(m.from.address)?.signatureId ?? m.signatureId, quotedHtml: quoteFor(m, "reply") };
  }
  if (mode === "duplicate") {
    return { ...base, from: m.from, to: m.to, cc: m.cc, bcc: m.bcc, replyTo: m.replyTo, subject: m.subject, bodyHtml: m.bodyHtml, signatureId: m.signatureId, quotedHtml: m.quotedHtml, attachments: m.attachments };
  }
  return base;
}

export default function ComposeScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ mode?: Mode; id?: string; mailbox?: string }>();
  const mode: Mode = params.mode ?? "new";
  const { domain } = useSession();
  const signatures = useSignatures();
  const source = useMessage(params.id);
  const { ids, fromChoices, identityFor, ready: idsReady } = useFromChoices();
  const ready = idsReady && signatures.isSuccess && (!params.id || source.isSuccess);
  const initial = useMemo(
    () => (ready ? buildDraft({ mode, m: source.data, ids, fromChoices, identityFor, mailbox: params.mailbox, domain }) : null),
    // Calculé une seule fois, quand toutes les données sont prêtes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready],
  );
  if (!initial) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }
  return <ComposeForm initial={initial} mode={mode} />;
}

function ComposeForm({ initial, mode }: { initial: Draft; mode: Mode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { domain } = useSession();
  const signatures = useSignatures();
  const contacts = useContacts();

  const [draft, setDraft] = useState<Draft>(initial);
  const [showCc, setShowCc] = useState(initial.cc.length > 0 || initial.bcc.length > 0);
  const [showQuote, setShowQuote] = useState(false);
  const [fromOpen, setFromOpen] = useState(false);
  const [uploads, setUploads] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initial.error ?? null);
  const editor = useRef<RichEditorHandle>(null);
  const fromScrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const dirty = useRef(false);
  const draftRef = useRef<Draft | null>(initial);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const { access, fromChoices, identityFor } = useFromChoices();

  const update = (patch: Partial<Draft>) => {
    dirty.current = true;
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  /* ---------- Brouillon automatique ---------- */
  const hasContent = (d: Draft) => d.to.length + d.cc.length + d.bcc.length > 0 || d.subject.trim() || htmlToPlain(d.bodyHtml) || d.attachments.length;
  const toInput = (d: Draft): ComposeInput => ({
    draftId: d.draftId,
    from: d.from,
    to: d.to,
    cc: d.cc,
    bcc: d.bcc,
    replyTo: d.replyTo,
    subject: d.subject,
    bodyHtml: d.bodyHtml,
    signatureId: d.signatureId,
    quotedHtml: d.quotedHtml,
    attachmentIds: d.attachments.map((a) => a.id),
    inReplyTo: d.inReplyTo,
    references: d.references,
  });
  const saving = useRef<Promise<void> | null>(null);
  const saveDraft = useCallback(async () => {
    if (saving.current) await saving.current;
    const d = draftRef.current;
    if (!d || !dirty.current || !hasContent(d)) return;
    dirty.current = false;
    saving.current = api<{ message: MessageSummary }>("/api/drafts", { json: toInput(d) })
      .then(({ message }) => {
        setDraft((cur) => (cur ? { ...cur, draftId: message.id } : cur));
        if (draftRef.current) draftRef.current = { ...draftRef.current, draftId: message.id };
        setSavedAt(message.updatedAt);
        void queryClient.invalidateQueries({ queryKey: ["messages"] });
      })
      .catch(() => {
        dirty.current = true;
      })
      .finally(() => {
        saving.current = null;
      });
    await saving.current;
  }, [queryClient]);

  useEffect(() => {
    if (!dirty.current) return;
    const id = setTimeout(() => void saveDraft(), 3000);
    return () => clearTimeout(id);
  }, [draft, saveDraft]);

  const close = async () => {
    if (uploads.length) return Alert.alert("Envoi de fichiers en cours", "Attendez la fin de l'envoi des pièces jointes.");
    await saveDraft();
    router.back();
  };

  const discard = () => {
    Alert.alert("Supprimer ce brouillon ?", undefined, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          dirty.current = false;
          if (saving.current) await saving.current;
          const id = draftRef.current?.draftId;
          if (id) await api(`/api/messages/${id}`, { method: "DELETE" }).catch(() => {});
          await queryClient.invalidateQueries({ queryKey: ["messages"] });
          router.back();
        },
      },
    ]);
  };

  /* ---------- Pièces jointes et images ---------- */
  const totalBytes = (draft?.attachments ?? []).reduce((s, a) => s + Math.ceil(a.size / 3) * 4, 0);

  const addAttachments = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    let budget = MAX_MESSAGE_BYTES - totalBytes - 64 * 1024;
    for (const f of res.assets) {
      const cost = Math.ceil((f.size ?? 0) / 3) * 4;
      if (cost > budget) {
        Alert.alert("Fichier trop volumineux", `« ${f.name} » dépasse la limite de 5 Mo par message.`);
        continue;
      }
      budget -= cost;
      setUploads((u) => [...u, f.name]);
      api<{ attachment: AttachmentMeta }>("/api/attachments", { form: { file: { uri: f.uri, name: f.name, type: f.mimeType ?? "application/octet-stream" } } })
        .then(({ attachment }) => {
          dirty.current = true;
          setDraft((d) => (d ? { ...d, attachments: [...d.attachments, attachment] } : d));
        })
        .catch((err: Error) => Alert.alert("Pièce jointe", err.message))
        .finally(() => setUploads((u) => u.filter((n) => n !== f.name)));
    }
  };

  const [library, setLibrary] = useState<LibraryImage[] | null>(null);
  const uploadImage = async (asset: { uri: string; fileName?: string | null; mimeType?: string }) => {
    setUploads((u) => [...u, "image"]);
    try {
      const img = await api<LibraryImage>("/api/images", {
        form: { file: { uri: asset.uri, name: asset.fileName || "image.jpg", type: asset.mimeType || "image/jpeg" } },
      });
      editor.current?.insertImage(img.url, img.width);
    } catch (err) {
      Alert.alert("Image", (err as Error).message);
    } finally {
      setUploads((u) => u.filter((n) => n !== "image"));
    }
  };
  const pickImage = () => {
    Alert.alert("Insérer une image", undefined, [
      {
        text: "Photothèque",
        onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
          if (!r.canceled) await uploadImage(r.assets[0]);
        },
      },
      {
        text: "Appareil photo",
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) return;
          const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
          if (!r.canceled) await uploadImage(r.assets[0]);
        },
      },
      {
        text: "Mes images",
        onPress: async () => {
          const res = await api<{ images: LibraryImage[] }>("/api/images").catch(() => ({ images: [] }));
          setLibrary(res.images);
        },
      },
      { text: "Annuler", style: "cancel" },
    ]);
  };

  /* ---------- Envoi ---------- */
  const send = async () => {
    const d = draftRef.current;
    if (!d) return;
    setError(null);
    const all = [...d.to, ...d.cc, ...d.bcc];
    const local = d.from.address.split("@")[0];
    if (!d.from.address.endsWith(`@${domain}`) || !LOCAL_PART_RE.test(local)) return setError(`Choisissez une adresse d'expédition @${domain}`);
    if (!d.to.length) return setError("Ajoutez au moins un destinataire");
    const invalid = all.filter((a) => !isValidEmail(a.address));
    if (invalid.length) return setError(`Adresse invalide : ${invalid.map((a) => a.address).join(", ")}`);
    if (all.length > MAX_RECIPIENTS) return setError(`Maximum ${MAX_RECIPIENTS} destinataires au total`);
    if (uploads.length) return setError("Attendez la fin de l'envoi des fichiers");

    const confirmations: string[] = [];
    if (!d.subject.trim()) confirmations.push("Le message n'a pas d'objet.");
    if (!d.attachments.length && ATTACHMENT_HINT.test(htmlToPlain(d.bodyHtml))) confirmations.push("Vous parlez d'une pièce jointe mais aucun fichier n'est joint.");
    if (confirmations.length) {
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert("Envoyer quand même ?", confirmations.join("\n"), [
          { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
          { text: "Envoyer", onPress: () => resolve(true) },
        ]),
      );
      if (!ok) return;
    }

    setSending(true);
    dirty.current = false;
    if (saving.current) await saving.current;
    try {
      const { message } = await api<{ message: MessageSummary }>("/api/send", { json: toInput(draftRef.current!) });
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
      const bounced = [...(message.result?.permanent_bounces ?? []), ...(message.result?.suppressed_recipients ?? [])];
      if (bounced.length) Alert.alert("Message envoyé", `Rejeté pour : ${bounced.join(", ")}`);
      router.back();
    } catch (err) {
      const data = err instanceof ApiError ? (err.data as { draftId?: string } | undefined) : undefined;
      if (data?.draftId) setDraft((cur) => (cur ? { ...cur, draftId: data.draftId! } : cur));
      setError((err as Error).message);
      setSending(false);
    }
  };

  const signature = signatures.data?.find((s) => s.id === draft.signatureId);
  const canTypeAddress = access === "*";

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.surface }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* Barre du haut */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: t.border }}>
          <IconButton name="close" label="Fermer (enregistre le brouillon)" onPress={() => void close()} />
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <AppText variant="heading" numberOfLines={1}>{draft.subject.trim() || "Nouveau message"}</AppText>
            {savedAt && <AppText variant="caption" color={t.subtle}>Brouillon enregistré</AppText>}
          </View>
          <IconButton name="trash-outline" label="Supprimer le brouillon" onPress={discard} />
          <Pressable
            onPress={() => void send()}
            disabled={sending}
            accessibilityLabel="Envoyer"
            style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: t.accent, borderRadius: radius.pill, paddingHorizontal: 16, height: 38, opacity: sending ? 0.6 : 1 }}
          >
            {sending ? <ActivityIndicator color={t.accentFg} /> : <Icon name="send" size={16} color={t.accentFg} />}
            <AppText color={t.accentFg} style={{ fontWeight: "700" }}>Envoyer</AppText>
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
          {/* De */}
          <Pressable onPress={() => setFromOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, minHeight: 48, borderBottomWidth: 0.5, borderBottomColor: t.border }}>
            <AppText variant="small" color={t.muted} style={{ width: 44 }}>De</AppText>
            <AppText style={{ flex: 1 }} numberOfLines={1}>
              {draft.from.address ? (draft.from.name ? `${draft.from.name} <${draft.from.address}>` : draft.from.address) : "Choisir une adresse"}
            </AppText>
            <Icon name="chevron-down" size={16} />
          </Pressable>

          <RecipientField
            label="À"
            value={draft.to}
            onChange={(to) => update({ to })}
            contacts={contacts.data ?? []}
            autoFocus={mode === "new" || mode === "forward"}
            right={!showCc ? <Pressable onPress={() => setShowCc(true)} hitSlop={8}><AppText variant="small" color={t.muted}>Cc/Cci</AppText></Pressable> : null}
          />
          {showCc && (
            <>
              <RecipientField label="Cc" value={draft.cc} onChange={(cc) => update({ cc })} contacts={contacts.data ?? []} />
              <RecipientField label="Cci" value={draft.bcc} onChange={(bcc) => update({ bcc })} contacts={contacts.data ?? []} />
              <RecipientField label="Rép. à" single value={draft.replyTo ? [draft.replyTo] : []} onChange={(l) => update({ replyTo: l[0] ?? null })} contacts={contacts.data ?? []} />
            </>
          )}
          <TextInput
            value={draft.subject}
            onChangeText={(subject) => update({ subject })}
            placeholder="Objet"
            placeholderTextColor={t.subtle}
            style={{ paddingHorizontal: 16, minHeight: 50, fontSize: 17, fontWeight: "600", color: t.text, borderBottomWidth: 0.5, borderBottomColor: t.border }}
          />

          {(draft.attachments.length > 0 || uploads.length > 0) && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 12 }} style={{ flexGrow: 0, borderBottomWidth: 0.5, borderBottomColor: t.border }}>
              {draft.attachments.map((a) => (
                <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.md, borderWidth: 0.5, borderColor: t.border, backgroundColor: t.surface2, paddingLeft: 10, paddingRight: 4, paddingVertical: 6, maxWidth: 240 }}>
                  <Icon name="document-attach-outline" size={16} />
                  <AppText variant="small" numberOfLines={1} style={{ flexShrink: 1 }}>{a.filename}</AppText>
                  <AppText variant="caption" color={t.subtle}>{formatBytes(a.size)}</AppText>
                  <IconButton name="close" size={16} label={`Retirer ${a.filename}`} onPress={() => update({ attachments: draft.attachments.filter((x) => x.id !== a.id) })} />
                </View>
              ))}
              {uploads.map((u, i) => (
                <View key={`${u}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.md, backgroundColor: t.surface2, paddingHorizontal: 10, paddingVertical: 8 }}>
                  <ActivityIndicator size="small" />
                  <AppText variant="small" color={t.muted}>{u === "image" ? "Image…" : u}</AppText>
                </View>
              ))}
            </ScrollView>
          )}

          {error && (
            <View style={{ margin: 12, padding: 12, borderRadius: radius.md, backgroundColor: t.dangerSoft }}>
              <AppText variant="small" color={t.danger}>{error}</AppText>
            </View>
          )}

          <View style={{ minHeight: 280 }}>
            <RichEditor ref={editor} initialHtml={draft.bodyHtml} onChange={(bodyHtml) => update({ bodyHtml })} onPickImage={pickImage} />
          </View>

          {signature && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <AppText variant="caption" color={t.subtle}>Signature « {signature.name} » ajoutée à l&apos;envoi</AppText>
            </View>
          )}
          {draft.quotedHtml && (
            <View style={{ paddingHorizontal: 12, paddingBottom: 16, gap: 8 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable onPress={() => setShowQuote((v) => !v)} style={{ backgroundColor: t.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <AppText variant="caption" color={t.muted}>{showQuote ? "Masquer le message cité" : "••• Afficher le message cité"}</AppText>
                </Pressable>
                <Pressable onPress={() => update({ quotedHtml: null })}>
                  <AppText variant="caption" color={t.subtle}>Retirer</AppText>
                </Pressable>
              </View>
              {showQuote && <EmailView html={draft.quotedHtml} token={null} />}
            </View>
          )}
        </ScrollView>

        {/* Barre du bas */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6 + insets.bottom, borderTopWidth: 0.5, borderTopColor: t.border }}>
          <IconButton name="attach" label="Joindre des fichiers" onPress={() => void addAttachments()} />
          <IconButton name="image-outline" label="Insérer une image" onPress={pickImage} />
          <Pressable
            onPress={() => {
              const list = signatures.data ?? [];
              Alert.alert("Signature", undefined, [
                ...list.map((s) => ({ text: (s.id === draft.signatureId ? "✓ " : "") + s.name, onPress: () => update({ signatureId: s.id }) })),
                { text: "Sans signature", onPress: () => update({ signatureId: null }) },
                { text: "Annuler", style: "cancel" as const },
              ]);
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 36, borderRadius: radius.pill, backgroundColor: t.surface2 }}
          >
            <Icon name="create-outline" size={15} />
            <AppText variant="small" numberOfLines={1}>{signature?.name ?? "Sans signature"}</AppText>
          </Pressable>
          <View style={{ flex: 1 }} />
          {totalBytes > 0 && <AppText variant="caption" color={totalBytes > MAX_MESSAGE_BYTES * 0.9 ? t.danger : t.subtle}>{formatBytes(totalBytes)} / 5 Mo</AppText>}
        </View>
      </KeyboardAvoidingView>

      {/* Choix de l'expéditeur */}
      <Modal visible={fromOpen} transparent animationType="fade" onRequestClose={() => { Keyboard.dismiss(); setFromOpen(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={() => { Keyboard.dismiss(); setFromOpen(false); }}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{ backgroundColor: t.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 12, maxHeight: "85%" }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
                <AppText variant="heading">Envoyer depuis</AppText>
                <IconButton name="close" label="Fermer" onPress={() => { Keyboard.dismiss(); setFromOpen(false); }} />
              </View>
              <ScrollView
                ref={fromScrollRef}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
              >
                {fromChoices.map((a) => (
                  <Pressable
                    key={a.address}
                    onPress={() => {
                      update({ from: a, signatureId: identityFor(a.address)?.signatureId ?? draft.signatureId });
                      Keyboard.dismiss();
                      setFromOpen(false);
                    }}
                    style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: a.address === draft.from.address ? t.accentSoft : pressed ? t.surface2 : "transparent" })}
                  >
                    <AppText>{a.name || a.address}</AppText>
                    {a.name && <AppText variant="caption" color={t.muted}>{a.address}</AppText>}
                  </Pressable>
                ))}
                {canTypeAddress && (
                  <CustomFrom
                    domain={domain ?? ""}
                    onPick={(a) => {
                      update({ from: a });
                      Keyboard.dismiss();
                      setFromOpen(false);
                    }}
                    onFocus={() => {
                      setTimeout(() => {
                        fromScrollRef.current?.scrollToEnd({ animated: true });
                      }, 150);
                    }}
                  />
                )}
                {!fromChoices.length && !canTypeAddress && (
                  <AppText color={t.muted} style={{ padding: 16 }}>Aucune adresse ne vous est attribuée sur ce domaine.</AppText>
                )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Mes images */}
      <Modal visible={library !== null} animationType="slide" onRequestClose={() => setLibrary(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.surface }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 8 }}>
            <IconButton name="close" label="Fermer" onPress={() => setLibrary(null)} />
            <AppText variant="heading">Mes images</AppText>
          </View>
          <ScrollView contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 12 }}>
            {(library ?? []).map((img) => (
              <Pressable
                key={img.name}
                onPress={() => {
                  editor.current?.insertImage(img.url, img.width);
                  setLibrary(null);
                }}
                style={{ width: "30%", aspectRatio: 1, borderRadius: radius.md, borderWidth: 0.5, borderColor: t.border, backgroundColor: "#fff", overflow: "hidden" }}
              >
                <EmailThumb url={img.url} />
              </Pressable>
            ))}
            {library?.length === 0 && <AppText color={t.muted}>Aucune image importée pour l&apos;instant.</AppText>}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function CustomFrom({
  domain,
  onPick,
  onFocus,
}: {
  domain: string;
  onPick: (a: Address) => void;
  onFocus?: () => void;
}) {
  const t = useTheme();
  const [local, setLocal] = useState("");
  const [name, setName] = useState("");
  const valid = LOCAL_PART_RE.test(local);
  return (
    <View style={{ padding: 16, gap: 10, borderTopWidth: 0.5, borderTopColor: t.border }}>
      <AppText variant="small" color={t.muted}>Autre adresse</AppText>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 0.5,
          borderColor: t.border,
          borderRadius: radius.md,
          paddingHorizontal: 12,
          backgroundColor: t.surface,
        }}
      >
        <TextInput
          value={local}
          onChangeText={(v) => setLocal(v.trim().toLowerCase())}
          onFocus={onFocus}
          placeholder="contact"
          placeholderTextColor={t.subtle}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={{ flex: 1, height: 46, color: t.text, fontSize: 16 }}
        />
        <AppText color={t.muted}>@{domain}</AppText>
      </View>
      <TextInput
        value={name}
        onChangeText={setName}
        onFocus={onFocus}
        placeholder="Nom affiché (facultatif)"
        placeholderTextColor={t.subtle}
        style={{
          height: 46,
          borderWidth: 0.5,
          borderColor: t.border,
          borderRadius: radius.md,
          paddingHorizontal: 12,
          color: t.text,
          fontSize: 16,
          backgroundColor: t.surface,
        }}
      />
      <Button
        title="Utiliser cette adresse"
        disabled={!valid}
        onPress={() => onPick({ address: `${local}@${domain}`, ...(name.trim() ? { name: name.trim() } : {}) })}
      />
    </View>
  );
}

function EmailThumb({ url }: { url: string }) {
  return <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} contentFit="contain" />;
}
