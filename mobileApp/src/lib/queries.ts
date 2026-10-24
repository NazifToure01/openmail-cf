import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useSession } from "./session";
import type { Contact, FolderCounts, Identity, Mailbox, Message, MessageSummary, RoutingInfo, Signature } from "./types";

/** Requêtes de l'app, toujours rattachées au domaine courant (clé de cache incluse) */

export type MailFolder = "inbox" | "sent" | "drafts" | "starred" | "trash";

export const FOLDERS: { id: MailFolder; label: string; icon: "mail-outline" | "paper-plane-outline" | "document-text-outline" | "star-outline" | "trash-outline" }[] = [
  { id: "inbox", label: "Réception", icon: "mail-outline" },
  { id: "sent", label: "Envoyés", icon: "paper-plane-outline" },
  { id: "drafts", label: "Brouillons", icon: "document-text-outline" },
  { id: "starred", label: "Suivis", icon: "star-outline" },
  { id: "trash", label: "Corbeille", icon: "trash-outline" },
];

export type Config = { domain: string; cloudflareConfigured: boolean; inboxConfigured: boolean; brandAssetsUrl: string | null };

export function useConfig() {
  const { domain } = useSession();
  return useQuery({ queryKey: ["config", domain], queryFn: () => api<Config>("/api/config") });
}

export function useMessages(folder: MailFolder, mailbox: string, q: string) {
  const { domain } = useSession();
  return useQuery({
    queryKey: ["messages", domain, folder, mailbox, q],
    queryFn: () => {
      const params = new URLSearchParams({ folder });
      if (mailbox) params.set("mailbox", mailbox);
      if (q) params.set("q", q);
      return api<{ messages: MessageSummary[]; counts: FolderCounts; mailboxes: Mailbox[] }>(`/api/messages?${params}`);
    },
  });
}

export function useMessage(id: string | undefined) {
  return useQuery({
    queryKey: ["message", id],
    enabled: Boolean(id),
    queryFn: () => api<{ message: Message }>(`/api/messages/${id}`).then((r) => r.message),
  });
}

export function useIdentities() {
  const { domain } = useSession();
  return useQuery({
    queryKey: ["identities", domain],
    queryFn: () => api<{ identities: Identity[]; routing: RoutingInfo }>("/api/identities"),
  });
}

export function useSignatures() {
  const { domain } = useSession();
  return useQuery({ queryKey: ["signatures", domain], queryFn: () => api<{ signatures: Signature[] }>("/api/signatures").then((r) => r.signatures) });
}

export function useContacts() {
  return useQuery({ queryKey: ["contacts"], queryFn: () => api<{ contacts: Contact[] }>("/api/contacts").then((r) => r.contacts) });
}
