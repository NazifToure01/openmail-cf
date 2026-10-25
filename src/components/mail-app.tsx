"use client";

import {
  AlertTriangle,
  AtSign,
  ChevronDown,
  Layers,
  FileEdit,
  Inbox,
  LogOut,
  Menu,
  Paperclip,
  PenSquare,
  RefreshCw,
  Search,
  Send,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { displayName } from "@/lib/addresses";
import { api, formatFullDate, formatListDate } from "@/lib/api";
import { escapeHtml, extractEmailContent } from "@/lib/email-html";
import type {
  Address,
  Contact,
  FolderCounts,
  Identity,
  Mailbox as MailboxInfo,
  Message,
  MessageSummary,
  RoutingInfo,
  Signature,
} from "@/lib/types";
import { AppIcon, BrandAssetsProvider, useBranding } from "./brand";
import { Compose, type ComposeDraft } from "./compose";
import { MessageView, type ViewAction } from "./message-view";
import { SETTINGS_TABS, Settings, type SettingsTab } from "./settings";
import type { AppUser } from "./settings-users";
import { Avatar, IconButton, Spinner, ToastProvider, cn, useToast } from "./ui";

type MailFolder = "inbox" | "sent" | "drafts" | "starred" | "trash";
type View = { type: "mail"; folder: MailFolder } | { type: "settings"; tab: SettingsTab };

const FOLDERS: { id: MailFolder; label: string; icon: typeof Send }[] = [
  { id: "inbox", label: "Réception", icon: Inbox },
  { id: "sent", label: "Envoyés", icon: Send },
  { id: "drafts", label: "Brouillons", icon: FileEdit },
  { id: "starred", label: "Suivis", icon: Star },
  { id: "trash", label: "Corbeille", icon: Trash2 },
];

type Config = { domain: string; cloudflareConfigured: boolean; inboxConfigured: boolean; brandAssetsUrl: string | null };

/* ---------- Boîte sélectionnée, mémorisée dans le navigateur ---------- */
const MAILBOX_KEY = "mb.mailbox";
const MAILBOX_EVENT = "mb-mailbox";
function subscribeMailbox(cb: () => void) {
  window.addEventListener(MAILBOX_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(MAILBOX_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function readMailbox() {
  try {
    return localStorage.getItem(MAILBOX_KEY) ?? "";
  } catch {
    return "";
  }
}
function writeMailbox(value: string) {
  try {
    localStorage.setItem(MAILBOX_KEY, value);
  } catch {}
  window.dispatchEvent(new Event(MAILBOX_EVENT));
}

export function MailApp() {
  return (
    <ToastProvider>
      <Mailbox />
    </ToastProvider>
  );
}

function Mailbox() {
  const toast = useToast();
  const branding = useBranding();
  const [config, setConfig] = useState<Config | null>(null);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [routing, setRouting] = useState<RoutingInfo | null>(null);
  const [me, setMe] = useState<AppUser | null>(null);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [view, setView] = useState<View>({ type: "mail", folder: "inbox" });
  const storedMailbox = useSyncExternalStore(subscribeMailbox, readMailbox, () => "");
  // La boîte mémorisée ne vaut que pour son domaine
  const mailbox = config && storedMailbox.endsWith(`@${config.domain}`) ? storedMailbox : "";
  const [mailboxes, setMailboxes] = useState<MailboxInfo[]>([]);
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [counts, setCounts] = useState<FolderCounts | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);

  const [compose, setCompose] = useState<{ key: string; draft: ComposeDraft } | null>(null);
  const [drawer, setDrawer] = useState(false);

  const folder = view.type === "mail" ? view.folder : null;

  /* ---------- Chargements ---------- */
  const loadSettings = useCallback(
    () =>
      Promise.all([
        api<Config>("/api/config"),
        api<{ identities: Identity[]; routing: RoutingInfo }>("/api/identities"),
        api<{ signatures: Signature[] }>("/api/signatures"),
        api<{ contacts: Contact[] }>("/api/contacts"),
        api<{ user: AppUser }>("/api/auth/me"),
      ])
        .then(([cfg, ids, sigs, cts, who]) => {
          setMe(who.user);
          setConfig(cfg);
          setIdentities(ids.identities);
          setRouting(ids.routing);
          setSignatures(sigs.signatures);
          setContacts(cts.contacts);
        })
        .catch((err: Error) => toast(err.message, "error")),
    [toast],
  );

  // Numéro de la dernière requête : une réponse plus ancienne (autre dossier ou autre boîte) est ignorée
  const listRequest = useRef(0);
  const loadMessages = useCallback(() => {
    if (!folder) return Promise.resolve();
    const params = new URLSearchParams({ folder });
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (mailbox) params.set("mailbox", mailbox);
    const request = ++listRequest.current;
    return api<{ messages: MessageSummary[]; counts: FolderCounts; mailboxes: MailboxInfo[] }>(`/api/messages?${params}`)
      .then((data) => {
        if (request !== listRequest.current) return;
        setMessages(data.messages);
        setCounts(data.counts);
        setMailboxes(data.mailboxes);
      })
      .catch((err: Error) => toast(err.message, "error"))
      .finally(() => request === listRequest.current && setLoadingList(false));
  }, [folder, debouncedQuery, mailbox, toast]);

  const loadMessagesRef = useRef(loadMessages);
  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  /** Récupère les nouveaux e-mails auprès du Worker de réception */
  const syncInbox = useCallback(
    async (silent: boolean) => {
      try {
        const r = await api<{ configured: boolean; imported: number }>("/api/inbox/sync", { method: "POST" });
        if (r.imported > 0) {
          toast(r.imported === 1 ? "1 nouveau message" : `${r.imported} nouveaux messages`, "info");
          await loadMessagesRef.current();
        }
      } catch (err) {
        if (!silent) toast((err as Error).message, "error");
      }
    },
    [toast],
  );

  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /** Remplace « en file d'attente » par le statut final quand Cloudflare l'a enregistré */
  const syncDeliveries = useCallback(
    () =>
      api<{ updated: number; error: string | null }>("/api/delivery/sync", { method: "POST" })
        .then(async (r) => {
          setDeliveryError(r.error);
          if (r.updated > 0) {
            await loadMessagesRef.current();
            setReloadKey((k) => k + 1);
          }
        })
        // silencieux : réessayé au prochain passage
        .catch(() => {}),
    [],
  );

  const inboxConfigured = config?.inboxConfigured ?? false;
  useEffect(() => {
    void syncDeliveries();
    const timer = setInterval(() => document.visibilityState === "visible" && void syncDeliveries(), 30_000);
    return () => clearInterval(timer);
  }, [syncDeliveries]);

  useEffect(() => {
    if (!inboxConfigured) return;
    void syncInbox(true);
    const tick = () => document.visibilityState === "visible" && void syncInbox(true);
    const timer = setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [inboxConfigured, syncInbox]);

  const refresh = async () => {
    setLoadingList(true);
    if (folder === "inbox" && inboxConfigured) await syncInbox(false);
    await loadMessages();
  };

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    api<{ message: Message }>(`/api/messages/${selectedId}`)
      .then(({ message }) => {
        if (cancelled) return;
        setSelected(message);
        if (message.direction === "in" && !message.read) {
          api(`/api/messages/${message.id}`, { method: "PATCH", json: { read: true } })
            .then(() => loadMessagesRef.current())
            .catch(() => {});
        }
      })
      .catch((err: Error) => !cancelled && toast(err.message, "error"));
    return () => {
      cancelled = true;
    };
  }, [selectedId, reloadKey, toast]);
  const shown = selected && selected.id === selectedId ? selected : null;

  /* ---------- Rédaction ---------- */
  const defaultIdentity = identities.find((i) => i.isDefault) ?? identities[0];
  const domain = config?.domain ?? "";

  const openCompose = useCallback(
    (patch: Partial<ComposeDraft> = {}) => {
      // Dans une boîte précise, on écrit depuis cette adresse
      const boxIdentity = mailbox ? identities.find((i) => i.address === mailbox) : undefined;
      const identity = boxIdentity ?? (mailbox ? undefined : defaultIdentity);
      const from: Address = identity
        ? { address: identity.address, ...(identity.name ? { name: identity.name } : {}) }
        : mailbox
          ? { address: mailbox }
          : { address: "" };
      setCompose({
        key: crypto.randomUUID(),
        draft: {
          draftId: null,
          from,
          to: [],
          cc: [],
          bcc: [],
          replyTo: null,
          subject: "",
          bodyHtml: "",
          signatureId: identity?.signatureId ?? (mailbox ? null : defaultIdentity?.signatureId ?? null),
          quotedHtml: null,
          attachments: [],
          ...patch,
        },
      });
    },
    [defaultIdentity, identities, mailbox],
  );

  // Raccourci « C » pour écrire
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "c" && !compose) {
        e.preventDefault();
        openCompose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compose, openCompose]);

  const draftFromMessage = (m: Message): Partial<ComposeDraft> => ({
    from: m.from,
    to: m.to,
    cc: m.cc,
    bcc: m.bcc,
    replyTo: m.replyTo,
    subject: m.subject,
    bodyHtml: m.bodyHtml,
    signatureId: m.signatureId,
    quotedHtml: m.quotedHtml,
    attachments: m.attachments,
    inReplyTo: m.inReplyTo ?? null,
    references: m.references ?? null,
  });

  const quoteHeader = (m: Message, title: string) => {
    const line = (label: string, list: Address[]) =>
      list.length ? `${label} : ${escapeHtml(list.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", "))}<br>` : "";
    return (
      `<p>${title ? `---------- ${title} ----------<br>` : ""}` +
      line("De", [m.from]) +
      `Date : ${escapeHtml(formatFullDate(m.sentAt ?? m.updatedAt))}<br>` +
      `Objet : ${escapeHtml(m.subject)}<br>` +
      line("À", m.to) +
      line("Cc", m.cc) +
      `</p><blockquote>${extractEmailContent(m.html ?? m.bodyHtml)}</blockquote>`
    );
  };

  const replyQuote = (m: Message) => {
    const who = escapeHtml(m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address);
    return (
      `<p>Le ${escapeHtml(formatFullDate(m.sentAt ?? m.updatedAt))}, ${who} a écrit :</p>` +
      `<blockquote>${extractEmailContent(m.html ?? m.bodyHtml)}</blockquote>`
    );
  };

  const defaultFrom = (): Address =>
    defaultIdentity
      ? { address: defaultIdentity.address, ...(defaultIdentity.name ? { name: defaultIdentity.name } : {}) }
      : { address: "" };

  const withPrefix = (prefix: string, subject: string) =>
    new RegExp(`^${prefix}\\s*:`, "i").test(subject) ? subject : `${prefix} : ${subject}`;

  const openDraft = async (id: string) => {
    try {
      const { message } = await api<{ message: Message }>(`/api/messages/${id}`);
      setCompose({ key: message.id, draft: { ...(draftFromMessage(message) as ComposeDraft), draftId: message.id, error: message.error } });
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  /* ---------- Actions ---------- */
  const handleAction = async (action: ViewAction) => {
    const m = shown;
    if (!m) return;
    const identity = identities.find((i) => i.address === m.from.address);

    // Pour un message reçu : répondre depuis l'adresse @domaine qui l'a reçu
    const ownAddress = m.deliveredTo
      ? { address: m.deliveredTo }
      : [...m.to, ...m.cc].find((a) => a.address.endsWith(`@${domain}`));
    const ownIdentity = identities.find((i) => i.address === ownAddress?.address) ?? (ownAddress ? undefined : defaultIdentity);
    const replyFrom: Address | undefined = ownIdentity
      ? { address: ownIdentity.address, ...(ownIdentity.name ? { name: ownIdentity.name } : {}) }
      : ownAddress
        ? { address: ownAddress.address }
        : undefined;
    const replyBase = (): Partial<ComposeDraft> => ({
      ...(replyFrom ? { from: replyFrom } : {}),
      subject: withPrefix("Re", m.subject),
      signatureId: ownIdentity?.signatureId ?? defaultIdentity?.signatureId ?? null,
      quotedHtml: replyQuote(m),
      inReplyTo: m.messageId ?? null,
      references: [m.references, m.messageId].filter(Boolean).join(" ") || null,
    });

    try {
      switch (action) {
        case "reply":
          return openCompose({ ...replyBase(), to: [m.replyTo ?? m.from] });
        case "replyAll": {
          const to = [m.replyTo ?? m.from];
          const skip = new Set([...to.map((a) => a.address), replyFrom?.address]);
          const cc = [...m.to, ...m.cc].filter((a) => !skip.has(a.address) && (skip.add(a.address), true));
          return openCompose({ ...replyBase(), to, cc });
        }
        case "unread":
          await api(`/api/messages/${m.id}`, { method: "PATCH", json: { read: false } });
          setSelectedId(null);
          break;
        case "followup":
          return openCompose({
            from: m.from,
            to: m.to,
            cc: m.cc,
            replyTo: m.replyTo,
            subject: withPrefix("Re", m.subject),
            signatureId: identity?.signatureId ?? m.signatureId,
            quotedHtml: quoteHeader(m, ""),
          });
        case "forward":
          return openCompose({
            from: m.direction === "in" ? (replyFrom ?? defaultFrom()) : m.from,
            subject: withPrefix("Tr", m.subject),
            signatureId: identity?.signatureId ?? m.signatureId,
            quotedHtml: quoteHeader(m, "Message transféré"),
            attachments: m.attachments.filter((a) => !a.inline || m.direction === "in"),
          });
        case "duplicate":
          return openCompose(draftFromMessage(m));
        case "edit":
          return openDraft(m.id);
        case "star": {
          const starred = !m.starred;
          setSelected({ ...m, starred });
          await api(`/api/messages/${m.id}`, { method: "PATCH", json: { starred } });
          break;
        }
        case "trash":
          await api(`/api/messages/${m.id}`, { method: "PATCH", json: { action: "trash" } });
          setSelectedId(null);
          toast("Message placé dans la corbeille", "info", {
            label: "Annuler",
            onClick: () => api(`/api/messages/${m.id}`, { method: "PATCH", json: { action: "restore" } }).then(loadMessages),
          });
          break;
        case "restore":
          await api(`/api/messages/${m.id}`, { method: "PATCH", json: { action: "restore" } });
          setSelectedId(null);
          toast("Message restauré", "success");
          break;
        case "delete":
          if (!confirm(m.folder === "drafts" ? "Supprimer ce brouillon ?" : "Supprimer définitivement ce message ? Cette action est irréversible.")) return;
          await api(`/api/messages/${m.id}`, { method: "DELETE" });
          setSelectedId(null);
          toast("Message supprimé", "info");
          break;
      }
      loadMessages();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const chooseMailbox = (address: string) => {
    if (address === mailbox) return;
    setLoadingList(true);
    setMessages([]);
    setSelectedId(null);
    writeMailbox(address);
    if (view.type !== "mail") setView({ type: "mail", folder: "inbox" });
    setDrawer(false);
  };

  const goTo = (v: View) => {
    if (v.type === "mail" && (view.type !== "mail" || view.folder !== v.folder)) {
      setLoadingList(true);
      setMessages([]);
    }
    setView(v);
    setSelectedId(null);
    setQuery("");
    setDrawer(false);
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Rechargement complet volontaire (cookie de session)
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  };

  const folderLabel = useMemo(() => FOLDERS.find((f) => f.id === folder)?.label ?? "", [folder]);

  /* ---------- Rendu ---------- */
  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="mb-3 flex items-center gap-2.5 px-2 pt-1">
        <AppIcon className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-brand text-[17px] font-extrabold tracking-[-0.04em]">{branding.name}</div>
          <div className="truncate text-xs text-muted">@{domain}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          openCompose();
          setDrawer(false);
        }}
        className="mb-3 flex h-11 items-center gap-2.5 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg shadow-sm transition-colors hover:bg-accent-hover"
      >
        <PenSquare size={17} /> Nouveau message
      </button>

      <MailboxPicker mailboxes={mailboxes} value={mailbox} onChange={chooseMailbox} />

      {FOLDERS.map((f) => {
        const active = view.type === "mail" && view.folder === f.id;
        const count = f.id === "inbox" ? counts?.unread : counts?.[f.id];
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => goTo({ type: "mail", folder: f.id })}
            className={cn(
              "flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
              active ? "bg-accent-soft font-semibold text-accent" : "text-fg hover:bg-hover",
            )}
          >
            <f.icon size={16} className={active ? "" : "text-muted"} />
            <span className="flex-1 text-left">{f.label}</span>
            {count ? <span className={cn("text-xs tabular-nums", active ? "text-accent" : "text-subtle")}>{count}</span> : null}
          </button>
        );
      })}

      <div className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-subtle">Réglages</div>
      {SETTINGS_TABS.filter((t) => !t.adminOnly || me?.role === "admin").map((t) => {
        const active = view.type === "settings" && view.tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => goTo({ type: "settings", tab: t.id })}
            className={cn(
              "flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
              active ? "bg-accent-soft font-semibold text-accent" : "text-fg hover:bg-hover",
            )}
          >
            <t.icon size={16} className={active ? "" : "text-muted"} />
            {t.label}
          </button>
        );
      })}

      <div className="mt-auto flex items-center gap-2 rounded-lg px-2 py-1.5">
        <Avatar label={me?.name || me?.email || "?"} className="h-8 w-8 text-xs" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-medium">{me?.name ?? "…"}</div>
          <div className="truncate text-[11px] text-subtle">{me?.email}</div>
        </div>
        <IconButton label="Se déconnecter" onClick={logout}>
          <LogOut size={16} />
        </IconButton>
      </div>
    </nav>
  );

  return (
    <BrandAssetsProvider value={config?.brandAssetsUrl ?? null}>
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:block">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="animate-pop absolute inset-y-0 left-0 w-64 border-r border-line bg-surface">{sidebar}</aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {config && !config.cloudflareConfigured && (
          <div className="flex items-center gap-2 border-b border-line bg-warning-soft px-4 py-2 text-[13px] text-warning">
            <AlertTriangle size={15} className="shrink-0" />
            <span>
              <b>CLOUDFLARE_API_TOKEN</b> n&apos;est pas défini dans <code>.env.local</code> : les envois échoueront tant qu&apos;il manque.
            </span>
          </div>
        )}

        {view.type === "settings" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2 lg:hidden">
              <IconButton label="Menu" onClick={() => setDrawer(true)}>
                <Menu size={18} />
              </IconButton>
              <span className="text-sm font-semibold">Réglages</span>
            </div>
            <div className="min-h-0 flex-1">
              <Settings tab={view.tab} domain={domain} identities={identities} signatures={signatures} contacts={contacts} routing={routing} me={me} reload={loadSettings} />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* Liste */}
            <section
              className={cn(
                "flex min-h-0 w-full flex-col border-r border-line bg-surface lg:w-[380px] lg:shrink-0",
                selectedId && "hidden lg:flex",
              )}
            >
              <div className="flex items-center gap-1 border-b border-line px-3 py-2">
                <IconButton label="Menu" onClick={() => setDrawer(true)} className="lg:hidden">
                  <Menu size={18} />
                </IconButton>
                <h1 className="min-w-0 truncate px-1 text-[15px] font-semibold">
                  {folderLabel}
                </h1>
                {mailbox && (
                  <span className="ml-1 inline-flex min-w-0 items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent">
                    <span className="truncate">{mailbox}</span>
                    <button
                      type="button"
                      aria-label="Afficher toutes les boîtes"
                      title="Afficher toutes les boîtes"
                      onClick={() => chooseMailbox("")}
                      className="rounded-full p-0.5 hover:bg-accent/10"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
                <span className="flex-1" />
                <IconButton label="Actualiser" onClick={refresh}>
                  <RefreshCw size={15} className={cn(loadingList && "animate-spin")} />
                </IconButton>
              </div>
              <div className="border-b border-line px-3 py-2">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-2.5 text-subtle" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Rechercher (destinataire, objet, contenu…)"
                    className="h-9 w-full rounded-lg bg-surface-2 pl-9 pr-8 text-sm outline-none placeholder:text-subtle focus:ring-2 focus:ring-accent/30"
                  />
                  {query && (
                    <button type="button" aria-label="Effacer" onClick={() => setQuery("")} className="absolute right-2 top-2 rounded p-0.5 text-muted hover:text-fg">
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {loadingList && messages.length === 0 ? (
                  <div className="flex justify-center py-10 text-muted">
                    <Spinner />
                  </div>
                ) : messages.length === 0 ? (
                  <EmptyList
                    folder={folder!}
                    searching={Boolean(debouncedQuery)}
                    inboxConfigured={inboxConfigured}
                    mailbox={mailbox}
                    onShowAll={() => chooseMailbox("")}
                    onCompose={() => openCompose()}
                  />
                ) : (
                  <ul>
                    {messages.map((m) => (
                      <MessageRow
                        key={m.id}
                        m={m}
                        active={m.id === selectedId}
                        onClick={() => (m.folder === "drafts" && folder === "drafts" ? openDraft(m.id) : setSelectedId(m.id))}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Lecture */}
            <section className={cn("min-w-0 flex-1 bg-bg", !selectedId && "hidden lg:block")}>
              <MessageView deliveryError={deliveryError} message={shown} loading={Boolean(selectedId) && !shown} onAction={handleAction} onBack={() => setSelectedId(null)} />
            </section>
          </div>
        )}
      </main>

      {compose && (
        <Compose
          key={compose.key}
          initial={compose.draft}
          domain={domain}
          identities={identities}
          signatures={signatures}
          contacts={contacts}
          onClose={() => setCompose(null)}
          onDraftSaved={loadMessages}
          onSent={() => {
            loadMessages();
            loadSettings();
            // La remise réelle est enregistrée quelques secondes après l'envoi
            setTimeout(() => void syncDeliveries(), 8_000);
            setTimeout(() => void syncDeliveries(), 25_000);
          }}
        />
      )}
    </div>
    </BrandAssetsProvider>
  );
}

function MessageRow({ m, active, onClick }: { m: MessageSummary; active: boolean; onClick: () => void }) {
  const incoming = m.direction === "in";
  const unread = incoming && !m.read;
  const recipients = [...m.to, ...m.cc, ...m.bcc];
  const first = incoming ? m.from : recipients[0];
  const names = incoming ? displayName(m.from) : recipients.map(displayName).join(", ");
  const r = m.result;
  const bounced = (r?.permanent_bounces.length ?? 0) + (r?.suppressed_recipients?.length ?? 0);
  const queuedOnly = r && r.queued.length > 0 && r.delivered.length === 0;
  const date = m.sentAt ?? m.updatedAt;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors",
          active ? "bg-accent-soft" : "hover:bg-hover",
        )}
      >
        <span className="relative">
          <Avatar label={first ? first.name || first.address : "?"} />
          {unread && <span className="absolute -left-1.5 top-3.5 h-2 w-2 rounded-full bg-accent" aria-label="Non lu" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-bold" : "font-medium")}>
              {!incoming && <span className="text-muted">À : </span>}
              {names || <span className="italic text-subtle">aucun destinataire</span>}
            </span>
            <time className={cn("shrink-0 text-xs", unread ? "font-semibold text-accent" : "text-subtle")} dateTime={date}>
              {formatListDate(date)}
            </time>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className={cn("min-w-0 flex-1 truncate text-[13px]", unread ? "font-semibold" : "font-medium")}>{m.subject || "(sans objet)"}</span>
            {m.attachmentCount > 0 && <Paperclip size={13} className="shrink-0 text-subtle" />}
            {m.starred && <Star size={13} className="shrink-0 fill-warning text-warning" />}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {m.folder === "drafts" && (
              <span className={cn("shrink-0 rounded px-1.5 text-[11px] font-medium", m.error ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted")}>
                {m.error ? "Échec d'envoi" : "Brouillon"}
              </span>
            )}
            {bounced > 0 && <span className="shrink-0 rounded bg-danger-soft px-1.5 text-[11px] font-medium text-danger">Rejeté</span>}
            {queuedOnly && <span className="shrink-0 rounded bg-warning-soft px-1.5 text-[11px] font-medium text-warning">En attente</span>}
            <span className="truncate text-[13px] text-muted">{m.snippet || "—"}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-subtle">
            {incoming ? `pour ${m.deliveredTo ?? (m.to.map((a) => a.address).join(", ") || "—")}` : `de ${m.from.address || "—"}`}
          </div>
        </div>
      </button>
    </li>
  );
}

function EmptyList({
  folder,
  searching,
  inboxConfigured,
  mailbox,
  onShowAll,
  onCompose,
}: {
  folder: MailFolder;
  searching: boolean;
  inboxConfigured: boolean;
  mailbox: string;
  onShowAll: () => void;
  onCompose: () => void;
}) {
  if (folder === "inbox" && !inboxConfigured && !searching) {
    return (
      <div className="mx-4 my-6 rounded-2xl border border-dashed border-line px-5 py-6 text-center">
        <Inbox size={22} className="mx-auto mb-3 text-subtle" />
        <p className="text-sm font-medium">Réception non configurée</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Lancez <code>npm run deploy</code> : le script déploie le Worker de réception et configure{" "}
          <code>INBOX_WORKER_URL</code> et <code>INBOX_SECRET</code>. Activez aussi Email Routing sur le domaine.
        </p>
      </div>
    );
  }
  const text = searching
    ? "Aucun message ne correspond à la recherche"
    : {
        inbox: "Aucun message reçu",
        sent: "Aucun message envoyé",
        drafts: "Aucun brouillon",
        starred: "Aucun message suivi",
        trash: "La corbeille est vide",
      }[folder];
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <p className="text-sm text-muted">{text}</p>
      {mailbox && (
        <p className="mt-1 text-[13px] text-subtle">
          dans la boîte {mailbox} ·{" "}
          <button type="button" onClick={onShowAll} className="font-medium text-accent hover:underline">
            voir toutes les boîtes
          </button>
        </p>
      )}
      {folder === "sent" && !searching && !mailbox && (
        <button type="button" onClick={onCompose} className="mt-3 text-sm font-medium text-accent hover:underline">
          Écrire un premier message
        </button>
      )}
    </div>
  );
}

/** Choix de la boîte : toutes, ou une adresse @domaine (réception + envois de cette adresse) */
function MailboxPicker({
  mailboxes,
  value,
  onChange,
}: {
  mailboxes: MailboxInfo[];
  value: string;
  onChange: (address: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = mailboxes.find((b) => b.address === value);
  const totalUnread = mailboxes.reduce((n, b) => n + b.unread, 0);
  const options: { address: string; label: string; sub?: string; unread: number }[] = [
    { address: "", label: "Toutes les boîtes", unread: totalUnread },
    ...mailboxes.map((b) => ({ address: b.address, label: b.name || b.address, sub: b.name ? b.address : undefined, unread: b.unread })),
  ];
  // Une boîte choisie mais sans message encore (ex. adresse saisie) reste affichée
  if (value && !current) options.push({ address: value, label: value, unread: 0 });

  return (
    <div className="relative mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 text-left transition-colors hover:bg-hover"
      >
        {value ? <AtSign size={16} className="shrink-0 text-accent" /> : <Layers size={16} className="shrink-0 text-muted" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{value ? current?.name || value : "Toutes les boîtes"}</span>
          {value && current?.name && <span className="block truncate text-[11px] text-muted">{value}</span>}
        </span>
        <ChevronDown size={15} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul className="animate-pop absolute inset-x-0 top-12 z-20 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-pop">
            {options.map((o) => (
              <li key={o.address || "all"}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.address);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-hover",
                    o.address === value && "bg-accent-soft text-accent",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.label}</span>
                    {o.sub && <span className="block truncate text-xs text-muted">{o.sub}</span>}
                  </span>
                  {o.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular-nums text-accent-fg">{o.unread}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
