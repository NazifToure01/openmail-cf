import "server-only";
import { after } from "next/server";
import PostalMime from "postal-mime";
import sanitizeHtml from "sanitize-html";
import { processIncoming } from "./ai-mail";
import { storeAttachment } from "./attachments";
import { DuplicateError } from "./db";
import { messages } from "./store";
import { escapeHtml, htmlToText } from "./email-html";
import type { Address, AttachmentMeta, Message } from "./types";

/**
 * Import des e-mails reçus : le Worker de réception (dossier /worker) stocke chaque
 * message reçu par Cloudflare Email Routing ; l'application les récupère, les analyse,
 * puis les supprime du Worker.
 */

type WorkerItem = { key: string; from?: string; to?: string; size?: number; receivedAt?: string };

export function isInboxConfigured() {
  return Boolean(process.env.INBOX_WORKER_URL && process.env.INBOX_SECRET);
}

async function workerFetch(path: string, init?: RequestInit) {
  const base = process.env.INBOX_WORKER_URL!.replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.INBOX_SECRET}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Worker de réception : HTTP ${res.status} sur ${path}`);
  return res;
}

/**
 * Récupère les nouveaux e-mails. Pas de verrou partagé (impossible entre requêtes sur Workers) :
 * l'index unique sur inboundKey empêche les doublons si deux synchronisations se croisent.
 */
export function syncInbox(): Promise<number> {
  if (!isInboxConfigured()) return Promise.resolve(0);
  return runSync();
}

async function runSync(): Promise<number> {
  const imported: Message[] = [];
  for (let round = 0; round < 10; round++) {
    const { messages: pending, more } = (await (await workerFetch("/messages")).json()) as {
      messages: WorkerItem[];
      more: boolean;
    };
    for (const item of pending) {
      const path = `/messages/${encodeURIComponent(item.key)}`;
      const known = await messages.first("inbound_key = ?", [item.key]);
      if (!known) {
        const raw = await (await workerFetch(path)).arrayBuffer();
        const message = await importRaw(raw, item);
        if (message) imported.push(message);
      }
      // Supprimé du Worker seulement une fois enregistré ici
      await workerFetch(path, { method: "DELETE" });
    }
    if (!more || pending.length === 0) break;
  }
  // Tri et indexation par l'IA (si activés), après la réponse pour ne pas retarder l'import
  if (imported.length) after(() => processIncoming(imported));
  return imported.length;
}

/* ---------- Analyse d'un message MIME ---------- */

type PMAddress = { name: string; address?: string; group?: { name: string; address: string }[] };

function toAddresses(list: PMAddress[] | PMAddress | undefined): Address[] {
  const items = !list ? [] : Array.isArray(list) ? list : [list];
  return items
    .flatMap((a): { name: string; address?: string }[] => (a.group ? a.group : [a]))
    .filter((a): a is { name: string; address: string } => Boolean(a.address))
    .map((a) => ({ address: a.address.toLowerCase(), ...(a.name ? { name: a.name } : {}) }));
}

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img", "style", "center", "font", "span", "div", "u", "s", "del", "ins", "sup", "sub", "small", "big",
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col", "hr", "br",
  ],
  allowedAttributes: {
    "*": ["style", "class", "align", "valign", "width", "height", "bgcolor", "color", "border", "dir", "title", "lang"],
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "width", "height", "style"],
    font: ["face", "size", "color"],
    table: ["cellpadding", "cellspacing", "border", "width", "bgcolor", "align", "style", "role"],
    td: ["colspan", "rowspan", "width", "height", "bgcolor", "align", "valign", "style", "nowrap"],
    th: ["colspan", "rowspan", "width", "height", "bgcolor", "align", "valign", "style"],
    col: ["span", "width"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel", "cid"],
  allowedSchemesByTag: { img: ["http", "https", "cid", "data"] },
  // Les balises <style> sont nécessaires à la mise en page de nombreux e-mails ; le contenu
  // est de toute façon affiché dans une iframe isolée, sans scripts.
  allowVulnerableTags: true,
  disallowedTagsMode: "discard",
};

export function sanitizeEmailHtml(html: string) {
  return sanitizeHtml(html, SANITIZE);
}

function textToHtml(text: string): string {
  const linked = escapeHtml(text).replace(
    /(https?:\/\/[^\s<>"]+)/g,
    (url) => `<a href="${url}">${url}</a>`,
  );
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;white-space:pre-wrap;">${linked}</div>`;
}

const EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "text/calendar": ".ics",
  "message/rfc822": ".eml",
};

async function storeFile(content: ArrayBuffer | Uint8Array | string, meta: Omit<AttachmentMeta, "id" | "size">): Promise<AttachmentMeta> {
  const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return storeAttachment(data, meta);
}

async function importRaw(raw: ArrayBuffer, item: WorkerItem): Promise<Message | null> {
  const receivedAt = item.receivedAt ?? new Date().toISOString();
  const original = await storeFile(raw, { filename: "message-original.eml", type: "message/rfc822" });

  let message: Message;
  try {
    const email = await PostalMime.parse(raw, { attachmentEncoding: "arraybuffer" });

    const attachments: AttachmentMeta[] = [];
    for (const [i, att] of email.attachments.entries()) {
      const type = att.mimeType || "application/octet-stream";
      const meta = await storeFile(att.content, {
        filename: (att.filename || `piece-jointe-${i + 1}${EXTENSIONS[type] ?? ""}`).replace(/[\r\n"\\/]/g, "_").slice(0, 200),
        type,
        ...(att.contentId ? { contentId: att.contentId.replace(/^<|>$/g, "") } : {}),
      });
      attachments.push(meta);
    }

    let html = email.html ? sanitizeEmailHtml(email.html) : textToHtml(email.text ?? "");
    // Images intégrées : cid:xxx -> URL de la pièce jointe
    for (const a of attachments) {
      if (!a.contentId) continue;
      const cid = `cid:${a.contentId}`;
      if (html.includes(cid)) {
        html = html.split(cid).join(`/api/attachments/${a.id}`);
        a.inline = true;
      }
    }

    const date = email.date && !Number.isNaN(Date.parse(email.date)) ? new Date(email.date).toISOString() : receivedAt;
    const from = toAddresses(email.from as PMAddress | undefined)[0] ?? { address: (item.from ?? "").toLowerCase() };
    const to = toAddresses(email.to as PMAddress[] | undefined);

    message = {
      id: crypto.randomUUID(),
      folder: "inbox",
      direction: "in",
      read: false,
      from,
      to: to.length ? to : item.to ? [{ address: item.to.toLowerCase() }] : [],
      cc: toAddresses(email.cc as PMAddress[] | undefined),
      bcc: [],
      replyTo: toAddresses(email.replyTo as PMAddress[] | undefined)[0] ?? null,
      subject: (email.subject ?? "").replace(/[\r\n]+/g, " ").trim(),
      bodyHtml: "",
      signatureId: null,
      quotedHtml: null,
      html,
      text: email.text?.trim() || htmlToText(html),
      attachments,
      rawId: original.id,
      starred: false,
      createdAt: receivedAt,
      updatedAt: receivedAt,
      sentAt: date,
      messageId: email.messageId,
      inReplyTo: email.inReplyTo,
      references: email.references,
      inboundKey: item.key,
      deliveredTo: item.to?.toLowerCase(),
    };
  } catch (err) {
    // Message illisible : on le garde quand même, avec le fichier original
    console.error("Analyse MIME impossible", err);
    message = {
      id: crypto.randomUUID(),
      folder: "inbox",
      direction: "in",
      read: false,
      from: { address: (item.from ?? "inconnu").toLowerCase() },
      to: item.to ? [{ address: item.to.toLowerCase() }] : [],
      cc: [],
      bcc: [],
      replyTo: null,
      subject: "(message illisible — voir le fichier original)",
      bodyHtml: "",
      signatureId: null,
      quotedHtml: null,
      html: textToHtml("Ce message n'a pas pu être analysé. Téléchargez le fichier original pour le consulter."),
      text: "",
      attachments: [],
      rawId: original.id,
      starred: false,
      createdAt: receivedAt,
      updatedAt: receivedAt,
      sentAt: receivedAt,
      inboundKey: item.key,
      deliveredTo: item.to?.toLowerCase(),
    };
  }

  // Domaine d'envoi auquel appartient le message (celui de l'adresse qui l'a reçu)
  message.domain = (message.deliveredTo ?? message.to[0]?.address ?? "").split("@")[1]?.toLowerCase() || undefined;
  try {
    await messages.insert(message);
    return message;
  } catch (err) {
    // Déjà importé par une synchronisation simultanée
    if (!(err instanceof DuplicateError)) throw err;
    return null;
  }
}
