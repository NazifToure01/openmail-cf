"use client";

import {
  AlertCircle,
  ChevronDown,
  Eye,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Paperclip,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LOCAL_PART_RE, MAX_MESSAGE_BYTES, MAX_RECIPIENTS, displayName, isValidEmail } from "@/lib/addresses";
import { ApiError, api, formatBytes, formatTime, uploadAttachment } from "@/lib/api";
import { buildEmailHtml, estimateMessageBytes, htmlToText } from "@/lib/email-html";
import type { Address, AttachmentMeta, ComposeInput, Contact, Identity, MessageSummary, Signature } from "@/lib/types";
import { RichEditor } from "./editor";
import { EmailFrame } from "./email-frame";
import { RecipientInput } from "./recipient-input";
import { Button, IconButton, Modal, cn, useToast } from "./ui";

export type ComposeDraft = {
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
  inReplyTo?: string | null;
  references?: string | null;
  error?: string;
};

type Upload = { key: string; name: string; size: number; progress: number; error?: string };

const ATTACHMENT_HINT = /pi[eè]ces?[ -]jointes?|ci-joint|en pj\b|joint[es]? (?:le|la|les)|attached|attachment/i;

export function Compose({
  initial,
  domain,
  identities,
  signatures,
  contacts,
  onClose,
  onSent,
  onDraftSaved,
}: {
  initial: ComposeDraft;
  domain: string;
  identities: Identity[];
  signatures: Signature[];
  contacts: Contact[];
  onClose: () => void;
  onSent: (m: MessageSummary) => void;
  onDraftSaved: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<ComposeDraft>(initial);
  // Assistant IA : objet en cours et message cité (réponse, transfert) comme contexte
  const quotedText = useMemo(() => (draft.quotedHtml ? htmlToText(draft.quotedHtml).slice(0, 6000) : undefined), [draft.quotedHtml]);
  const aiContext = useMemo(() => ({ subject: draft.subject || undefined, replyTo: quotedText }), [draft.subject, quotedText]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [showCc, setShowCc] = useState(initial.cc.length > 0);
  const [showBcc, setShowBcc] = useState(initial.bcc.length > 0);
  const [showReplyTo, setShowReplyTo] = useState(Boolean(initial.replyTo));
  const [showQuote, setShowQuote] = useState(false);
  const [focusField, setFocusField] = useState<"cc" | "bcc" | "replyTo" | null>(null);
  const [mode, setMode] = useState<"normal" | "max" | "min">("normal");
  const [sending, setSending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(initial.error ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = useRef(false);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const update = useCallback((patch: Partial<ComposeDraft>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  /* ---------- Expéditeur ---------- */
  const matchedIdentity = identities.find((i) => i.address === draft.from.address);
  const [customFrom, setCustomFrom] = useState(!matchedIdentity && (identities.length === 0 || Boolean(initial.from.address)));
  const localPart = draft.from.address.endsWith(`@${domain}`) ? draft.from.address.slice(0, -domain.length - 1) : draft.from.address.split("@")[0];
  const fromValid = draft.from.address.endsWith(`@${domain}`) && LOCAL_PART_RE.test(localPart);

  const chooseIdentity = (id: string) => {
    if (id === "__custom") {
      setCustomFrom(true);
      return;
    }
    const identity = identities.find((i) => i.id === id);
    if (!identity) return;
    setCustomFrom(false);
    update({
      from: { address: identity.address, ...(identity.name ? { name: identity.name } : {}) },
      signatureId: identity.signatureId ?? draft.signatureId,
    });
  };

  /* ---------- Brouillon ---------- */
  const hasContent = (d: ComposeDraft) =>
    d.to.length + d.cc.length + d.bcc.length > 0 || d.subject.trim() || htmlToText(d.bodyHtml) || d.attachments.length;

  const toInput = (d: ComposeDraft): ComposeInput => ({
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
    inReplyTo: d.inReplyTo ?? null,
    references: d.references ?? null,
  });

  const savePromise = useRef<Promise<string | null> | null>(null);
  const saveDraft = useCallback(async (): Promise<string | null> => {
    if (savePromise.current) await savePromise.current;
    const d = draftRef.current;
    if (!dirty.current || !hasContent(d)) return d.draftId;
    dirty.current = false;
    setSaving(true);
    const run = api<{ message: MessageSummary }>("/api/drafts", { method: "POST", json: toInput(d) })
      .then(({ message }) => {
        setDraft((cur) => ({ ...cur, draftId: message.id }));
        draftRef.current = { ...draftRef.current, draftId: message.id };
        setSavedAt(message.updatedAt);
        onDraftSaved();
        return message.id;
      })
      .catch((err: Error) => {
        dirty.current = true;
        toast(`Brouillon non enregistré : ${err.message}`, "error");
        return d.draftId;
      })
      .finally(() => {
        setSaving(false);
        savePromise.current = null;
      });
    savePromise.current = run;
    return run;
  }, [onDraftSaved, toast]);

  // Enregistrement automatique
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(saveDraft, 2500);
    return () => clearTimeout(t);
  }, [draft, saveDraft]);

  // Si la fenêtre est remplacée par une autre, on enregistre ce qui reste
  const saveRef = useRef(saveDraft);
  useEffect(() => {
    saveRef.current = saveDraft;
  }, [saveDraft]);
  useEffect(() => () => void (dirty.current && saveRef.current()), []);

  const close = async () => {
    if (uploads.length) {
      if (!confirm("Des fichiers sont en cours d'envoi. Fermer quand même ?")) return;
    }
    const wasDirty = dirty.current && hasContent(draftRef.current);
    await saveDraft();
    if (wasDirty) toast("Brouillon enregistré", "info");
    onClose();
  };

  const discard = async () => {
    if (hasContent(draft) && !confirm("Supprimer ce brouillon ?")) return;
    dirty.current = false;
    if (savePromise.current) await savePromise.current;
    const id = draftRef.current.draftId;
    if (id) await api(`/api/messages/${id}`, { method: "DELETE" }).catch(() => {});
    onDraftSaved();
    onClose();
  };

  /* ---------- Pièces jointes ---------- */
  const totalAttachmentBytes = draft.attachments.reduce((s, a) => s + a.size, 0) + uploads.reduce((s, u) => s + u.size, 0);
  const signature = signatures.find((s) => s.id === draft.signatureId) ?? null;
  const finalHtml = useMemo(
    () => buildEmailHtml({ bodyHtml: draft.bodyHtml, signatureHtml: signature?.html, quotedHtml: draft.quotedHtml }),
    [draft.bodyHtml, signature, draft.quotedHtml],
  );
  const estimated = estimateMessageBytes(finalHtml.length, [...draft.attachments.map((a) => a.size), ...uploads.map((u) => u.size)]);
  const ratio = Math.min(1, estimated / MAX_MESSAGE_BYTES);

  const addFiles = (files: FileList | File[]) => {
    let budget = MAX_MESSAGE_BYTES - estimated;
    for (const file of Array.from(files)) {
      const cost = Math.ceil(file.size / 3) * 4;
      if (cost > budget) {
        toast(`« ${file.name} » (${formatBytes(file.size)}) dépasse la limite de 5 Mo par message`, "error");
        continue;
      }
      budget -= cost;
      const key = crypto.randomUUID();
      setUploads((u) => [...u, { key, name: file.name, size: file.size, progress: 0 }]);
      uploadAttachment(file, (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))))
        .then((meta) => {
          setUploads((u) => u.filter((x) => x.key !== key));
          dirty.current = true;
          setDraft((d) => ({ ...d, attachments: [...d.attachments, meta] }));
        })
        .catch((err: Error) => {
          setUploads((u) => u.filter((x) => x.key !== key));
          toast(err.message, "error");
        });
    }
  };

  /* ---------- Envoi ---------- */
  const send = async () => {
    const d = draftRef.current;
    setError(null);
    const all = [...d.to, ...d.cc, ...d.bcc];
    if (!fromValid) return setError(`Choisissez une adresse d'expédition valide en @${domain}`);
    if (d.to.length === 0) return setError("Ajoutez au moins un destinataire dans « À »");
    const invalid = all.filter((a) => !isValidEmail(a.address));
    if (invalid.length) return setError(`Adresse invalide : ${invalid.map((a) => a.address).join(", ")}`);
    if (all.length > MAX_RECIPIENTS) return setError(`Maximum ${MAX_RECIPIENTS} destinataires au total`);
    if (d.replyTo && !isValidEmail(d.replyTo.address)) return setError("L'adresse « Répondre à » est invalide");
    if (uploads.length) return setError("Attendez la fin de l'envoi des pièces jointes");
    if (estimated > MAX_MESSAGE_BYTES) return setError("Le message dépasse 5 Mo, retirez des pièces jointes");
    if (!d.subject.trim() && !confirm("Envoyer ce message sans objet ?")) return;
    if (!d.attachments.length && ATTACHMENT_HINT.test(htmlToText(d.bodyHtml)) && !confirm("Vous parlez d'une pièce jointe mais aucun fichier n'est joint. Envoyer quand même ?")) return;

    setSending(true);
    dirty.current = false;
    if (savePromise.current) await savePromise.current;
    try {
      const { message } = await api<{ message: MessageSummary }>("/api/send", {
        method: "POST",
        json: toInput(draftRef.current),
      });
      const r = message.result;
      const bounced = [...(r?.permanent_bounces ?? []), ...(r?.suppressed_recipients ?? [])];
      if (bounced.length) toast(`Envoyé, mais rejeté pour : ${bounced.join(", ")}`, "error");
      else if (r?.queued.length && !r.delivered.length) toast("Message envoyé (en file d'attente)", "success");
      else toast("Message envoyé", "success");
      onSent(message);
      onClose();
    } catch (err) {
      const data = err instanceof ApiError ? (err.data as { draftId?: string }) : undefined;
      if (data?.draftId) {
        setDraft((cur) => ({ ...cur, draftId: data.draftId! }));
        onDraftSaved();
      }
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  // Raccourci ⌘/Ctrl + Entrée
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        sendRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const title = draft.subject.trim() || "Nouveau message";

  if (mode === "min") {
    return (
      <div className="fixed bottom-0 right-4 z-40 w-[min(320px,calc(100vw-2rem))] animate-pop">
        <button
          type="button"
          onClick={() => setMode("normal")}
          className="flex w-full items-center gap-2 rounded-t-xl bg-fg px-4 py-2.5 text-left text-sm font-medium text-bg shadow-pop"
        >
          <span className="flex-1 truncate">{title}</span>
          <Maximize2 size={14} />
        </button>
      </div>
    );
  }

  return (
    <>
      {mode === "max" && <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setMode("normal")} />}
      <section
        aria-label="Rédaction"
        className={cn(
          "animate-pop fixed z-50 flex flex-col overflow-hidden border border-line bg-surface shadow-pop",
          "inset-0 sm:inset-auto",
          mode === "max"
            ? "sm:left-1/2 sm:top-1/2 sm:h-[min(860px,92vh)] sm:w-[min(1080px,94vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
            : "sm:bottom-0 sm:right-4 sm:h-[min(720px,calc(100vh-2rem))] sm:w-[min(680px,calc(100vw-2rem))] sm:rounded-t-2xl",
        )}
        onDragEnter={(e) => {
          if (e.dataTransfer.types.includes("Files")) setDragging(true);
        }}
        onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
        onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <header className="flex items-center gap-1 border-b border-line bg-surface-2 py-1.5 pl-4 pr-2">
          <h2 className="flex-1 truncate text-sm font-semibold">{title}</h2>
          <span className="mr-2 hidden text-xs text-subtle sm:inline">
            {saving ? "Enregistrement…" : savedAt ? `Brouillon enregistré à ${formatTime(savedAt)}` : ""}
          </span>
          <IconButton label="Réduire" onClick={() => setMode("min")} className="hidden sm:inline-flex">
            <Minus size={16} />
          </IconButton>
          <IconButton label={mode === "max" ? "Quitter le plein écran" : "Plein écran"} onClick={() => setMode(mode === "max" ? "normal" : "max")} className="hidden sm:inline-flex">
            {mode === "max" ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </IconButton>
          <IconButton label="Fermer (enregistre le brouillon)" onClick={close}>
            <X size={17} />
          </IconButton>
        </header>

        {/* De */}
        <div className="flex min-h-11 items-center gap-2 border-b border-line px-4 py-1.5">
          <span className="w-14 shrink-0 text-[13px] text-muted">De</span>
          {identities.length > 0 && (
            <div className="relative">
              <select
                aria-label="Adresse d'expédition"
                value={customFrom ? "__custom" : matchedIdentity?.id ?? "__custom"}
                onChange={(e) => chooseIdentity(e.target.value)}
                className="h-8 max-w-[260px] appearance-none truncate rounded-lg bg-surface-2 pl-2.5 pr-7 text-sm outline-none hover:bg-hover"
              >
                {identities.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name ? `${i.name} <${i.address}>` : i.address}
                  </option>
                ))}
                <option value="__custom">Autre adresse…</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2 top-2 text-muted" />
            </div>
          )}
          {(customFrom || identities.length === 0) && (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className={cn("flex h-8 items-center rounded-lg border bg-surface pl-2.5 text-sm", fromValid || !localPart ? "border-line" : "border-danger")}>
                <input
                  aria-label="Partie locale de l'adresse"
                  value={localPart}
                  onChange={(e) => update({ from: { ...draft.from, address: `${e.target.value.trim().toLowerCase()}@${domain}` } })}
                  placeholder="contact"
                  className="w-28 bg-transparent outline-none placeholder:text-subtle"
                />
                <span className="pr-2.5 text-muted">@{domain}</span>
              </div>
              <input
                aria-label="Nom affiché"
                value={draft.from.name ?? ""}
                onChange={(e) => update({ from: { ...draft.from, name: e.target.value || undefined } })}
                placeholder="Nom affiché (optionnel)"
                className="h-8 min-w-[140px] flex-1 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none placeholder:text-subtle focus:border-accent"
              />
            </div>
          )}
          {!customFrom && identities.length > 0 && <span className="flex-1" />}
        </div>

        <RecipientInput
          label="À"
          value={draft.to}
          onChange={(to) => update({ to })}
          contacts={contacts}
          autoFocus={initial.to.length === 0}
          trailing={
            <div className="flex shrink-0 gap-1 pt-1 text-[13px] text-muted">
              {!showCc && (
                <button type="button" className="rounded px-1.5 hover:bg-hover hover:text-fg" onClick={(e) => {
                    e.stopPropagation();
                    setShowCc(true);
                    setFocusField("cc");
                  }}>
                  Cc
                </button>
              )}
              {!showBcc && (
                <button type="button" className="rounded px-1.5 hover:bg-hover hover:text-fg" onClick={(e) => {
                    e.stopPropagation();
                    setShowBcc(true);
                    setFocusField("bcc");
                  }}>
                  Cci
                </button>
              )}
              {!showReplyTo && (
                <button type="button" className="hidden rounded px-1.5 hover:bg-hover hover:text-fg sm:inline" onClick={(e) => {
                    e.stopPropagation();
                    setShowReplyTo(true);
                    setFocusField("replyTo");
                  }}>
                  Répondre à
                </button>
              )}
            </div>
          }
        />
        {showCc && <RecipientInput label="Cc" autoFocus={focusField === "cc"} value={draft.cc} onChange={(cc) => update({ cc })} contacts={contacts} />}
        {showBcc && <RecipientInput label="Cci" autoFocus={focusField === "bcc"} value={draft.bcc} onChange={(bcc) => update({ bcc })} contacts={contacts} />}
        {showReplyTo && (
          <RecipientInput
            label="Rép. à"
            single
            autoFocus={focusField === "replyTo"}
            value={draft.replyTo ? [draft.replyTo] : []}
            onChange={(list) => update({ replyTo: list[0] ?? null })}
            contacts={contacts}
          />
        )}

        <div className="flex items-center border-b border-line px-4">
          <input
            aria-label="Objet"
            value={draft.subject}
            onChange={(e) => update({ subject: e.target.value })}
            placeholder="Objet"
            className="h-11 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-subtle"
          />
        </div>

        <RichEditor
          className="min-h-0 flex-1"
          value={draft.bodyHtml}
          onChange={(bodyHtml) => update({ bodyHtml })}
          placeholder="Écrivez votre message…"
          minHeight={140}
          aiContext={aiContext}
          autoFocus={initial.to.length > 0}
          footer={
            <div className="space-y-3 px-4 pb-4">
              {signature && (
                <div className="group relative rounded-lg border border-dashed border-transparent p-2 -m-2 hover:border-line">
                  <div className="mail-content text-fg/90" dangerouslySetInnerHTML={{ __html: signature.html }} />
                  <span className="absolute right-2 top-1 hidden text-[11px] text-subtle group-hover:block">Signature « {signature.name} »</span>
                </div>
              )}
              {draft.quotedHtml && (
                <div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowQuote((v) => !v)}
                      className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted hover:bg-hover hover:text-fg"
                    >
                      {showQuote ? "Masquer le message cité" : "••• Afficher le message cité"}
                    </button>
                    <button type="button" onClick={() => update({ quotedHtml: null })} className="text-xs text-subtle hover:text-danger">
                      Retirer
                    </button>
                  </div>
                  {showQuote && <EmailFrame html={draft.quotedHtml} className="mt-3" />}
                </div>
              )}
            </div>
          }
        />

        {(draft.attachments.length > 0 || uploads.length > 0) && (
          <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto border-t border-line px-4 py-2.5">
            {draft.attachments.map((a) => (
              <span key={a.id} className="inline-flex max-w-[260px] items-center gap-2 rounded-lg border border-line bg-surface-2 py-1.5 pl-2.5 pr-1 text-[13px]">
                <FileText size={14} className="shrink-0 text-muted" />
                <a href={`/api/attachments/${a.id}`} target="_blank" className="truncate hover:underline" rel="noreferrer">
                  {a.filename}
                </a>
                <span className="shrink-0 text-xs text-subtle">{formatBytes(a.size)}</span>
                <button
                  type="button"
                  aria-label={`Retirer ${a.filename}`}
                  onClick={() => update({ attachments: draft.attachments.filter((x) => x.id !== a.id) })}
                  className="rounded p-0.5 text-muted hover:bg-hover hover:text-danger"
                >
                  <X size={13} />
                </button>
              </span>
            ))}
            {uploads.map((u) => (
              <span key={u.key} className="relative inline-flex max-w-[260px] items-center gap-2 overflow-hidden rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-muted">
                <Loader2 size={14} className="shrink-0 animate-spin" />
                <span className="truncate">{u.name}</span>
                <span className="shrink-0 text-xs">{Math.round(u.progress * 100)} %</span>
                <span className="absolute bottom-0 left-0 h-0.5 bg-accent transition-[width]" style={{ width: `${u.progress * 100}%` }} />
              </span>
            ))}
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-2 border-t border-line bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Masquer l'erreur">
              <X size={14} />
            </button>
          </div>
        )}

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
          <Button variant="primary" onClick={send} disabled={sending} className="pl-4 pr-4" title="Envoyer (⌘/Ctrl + Entrée)">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {sending ? "Envoi…" : "Envoyer"}
          </Button>
          <IconButton label="Joindre des fichiers" onClick={() => fileRef.current?.click()}>
            <Paperclip size={17} />
          </IconButton>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="relative">
            <select
              aria-label="Signature"
              value={draft.signatureId ?? ""}
              onChange={(e) => update({ signatureId: e.target.value || null })}
              className="h-8 max-w-[170px] appearance-none truncate rounded-lg pl-2.5 pr-7 text-[13px] text-muted outline-none hover:bg-hover"
            >
              <option value="">Sans signature</option>
              {signatures.map((s) => (
                <option key={s.id} value={s.id}>
                  ✍︎ {s.name}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2 top-2.5 text-muted" />
          </div>
          <IconButton label="Aperçu du rendu final" onClick={() => setPreview(true)}>
            <Eye size={17} />
          </IconButton>

          <div className="ml-auto flex items-center gap-2">
            {totalAttachmentBytes > 0 && (
              <div className="hidden items-center gap-2 sm:flex" title="Taille estimée du message encodé (limite Cloudflare : 5 Mo)">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={cn("h-full rounded-full", ratio > 0.9 ? "bg-danger" : ratio > 0.7 ? "bg-warning" : "bg-success")}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-subtle">{formatBytes(estimated)} / 5 Mo</span>
              </div>
            )}
            <IconButton label="Supprimer le brouillon" onClick={discard}>
              <Trash2 size={16} />
            </IconButton>
          </div>
        </footer>

        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/90 text-sm font-medium text-accent">
            Déposez les fichiers pour les joindre
          </div>
        )}
      </section>

      <Modal open={preview} onClose={() => setPreview(false)} title="Aperçu du message" wide>
        <div className="mb-3 space-y-0.5 text-[13px] text-muted">
          <div>
            <b className="font-medium text-fg">De :</b> {draft.from.name ? `${draft.from.name} <${draft.from.address}>` : draft.from.address}
          </div>
          <div>
            <b className="font-medium text-fg">À :</b> {draft.to.map(displayName).join(", ") || "—"}
          </div>
          <div>
            <b className="font-medium text-fg">Objet :</b> {draft.subject || "(sans objet)"}
          </div>
        </div>
        <iframe title="Aperçu" sandbox="" srcDoc={finalHtml} className="h-[60vh] w-full rounded-lg border border-line bg-white" />
      </Modal>
    </>
  );
}
