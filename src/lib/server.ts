import "server-only";
import { unstable_rethrow } from "next/navigation";
import {
  MAX_RECIPIENTS,
  belongsToDomain,
  dedupeAddresses,
  isValidEmail,
} from "./addresses";
import { htmlToText } from "./email-html";
import { HttpError } from "./errors";
import { database } from "./db";
import { authenticate, runAsUser } from "./session";
import type { Address, ComposeInput, Message, MessageSummary } from "./types";

export { HttpError };

/** Handler authentifié : utilisateur connecté, erreurs en JSON */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return (...args: A): Promise<Response> =>
    guard(async () => {
      const user = await authenticate();
      return runAsUser(user, () => fn(...args));
    });
}

/** Handler sans session (connexion, création du premier compte, webhooks protégés autrement) */
export function publicHandler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return (...args: A): Promise<Response> => guard(() => fn(...args));
}

async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    // Laisse passer les signaux internes de Next.js (prérendu, redirections…)
    unstable_rethrow(err);
    if (err instanceof HttpError) return Response.json({ error: err.message, code: err.code }, { status: err.status });
    console.error(err);
    return Response.json({ error: (err as Error).message || "Erreur serveur" }, { status: 500 });
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Corps JSON invalide");
  }
}

function cleanAddress(a: unknown): Address | null {
  if (!a || typeof a !== "object") return null;
  const { address, name } = a as Record<string, unknown>;
  if (typeof address !== "string") return null;
  const clean: Address = { address: address.trim().toLowerCase() };
  if (typeof name === "string" && name.trim()) clean.name = name.trim().replace(/[<>"\r\n]/g, "").slice(0, 120);
  return clean;
}

function cleanList(list: unknown): Address[] {
  if (!Array.isArray(list)) return [];
  return dedupeAddresses(list.map(cleanAddress).filter((a): a is Address => a !== null));
}

/** Normalise et valide les données de rédaction. `strict` = pour un envoi réel. */
export function normalizeCompose(raw: unknown, strict: boolean, domain: string): ComposeInput {
  if (!raw || typeof raw !== "object") throw new HttpError(400, "Données invalides");
  const r = raw as Record<string, unknown>;

  const from = cleanAddress(r.from) ?? { address: "" };
  const input: ComposeInput = {
    draftId: typeof r.draftId === "string" ? r.draftId : null,
    from,
    to: cleanList(r.to),
    cc: cleanList(r.cc),
    bcc: cleanList(r.bcc),
    replyTo: cleanAddress(r.replyTo),
    subject: typeof r.subject === "string" ? r.subject.replace(/[\r\n]+/g, " ").slice(0, 998) : "",
    bodyHtml: typeof r.bodyHtml === "string" ? r.bodyHtml : "",
    signatureId: typeof r.signatureId === "string" ? r.signatureId : null,
    quotedHtml: typeof r.quotedHtml === "string" && r.quotedHtml ? r.quotedHtml : null,
    attachmentIds: Array.isArray(r.attachmentIds)
      ? [...new Set(r.attachmentIds.filter((x): x is string => typeof x === "string"))]
      : [],
  };
  if (input.replyTo && !input.replyTo.address) input.replyTo = null;
  // En-têtes de fil : identifiants <...> uniquement, sans retour à la ligne
  const ids = (v: unknown) =>
    typeof v === "string" ? (v.match(/<[^<>\s]+>/g) ?? []) : [];
  input.inReplyTo = ids(r.inReplyTo)[0] ?? null;
  input.references = ids(r.references).slice(-20).join(" ") || null;

  if (strict) {
    if (!belongsToDomain(input.from.address, domain)) {
      throw new HttpError(400, `L'expéditeur doit être une adresse @${domain}`);
    }
    const all = [...input.to, ...input.cc, ...input.bcc];
    if (input.to.length === 0) throw new HttpError(400, "Ajoutez au moins un destinataire");
    if (all.length > MAX_RECIPIENTS) {
      throw new HttpError(400, `Maximum ${MAX_RECIPIENTS} destinataires au total (À + Cc + Cci)`);
    }
    const invalid = all.filter((a) => !isValidEmail(a.address));
    if (invalid.length) throw new HttpError(400, `Adresse(s) invalide(s) : ${invalid.map((a) => a.address).join(", ")}`);
    if (input.replyTo && !isValidEmail(input.replyTo.address)) {
      throw new HttpError(400, "L'adresse « Répondre à » est invalide");
    }
    if (!htmlToText(input.bodyHtml + (input.quotedHtml ?? "")).trim() && input.attachmentIds.length === 0) {
      throw new HttpError(400, "Le message est vide");
    }
  }
  return input;
}

export function summarize(m: Message): MessageSummary {
  const source = m.text ?? htmlToText(m.bodyHtml);
  return {
    id: m.id,
    folder: m.folder,
    direction: m.direction,
    read: m.read,
    deliveredTo: m.deliveredTo,
    from: m.from,
    to: m.to,
    cc: m.cc,
    bcc: m.bcc,
    subject: m.subject,
    starred: m.starred,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    sentAt: m.sentAt,
    result: m.result,
    error: m.error,
    snippet: source.replace(/\s+/g, " ").slice(0, 160),
    attachmentCount: m.attachments.filter((a) => !a.inline).length,
  };
}

/** Ajoute ou met à jour les destinataires dans les contacts (pour la saisie semi-automatique) */
export async function rememberContacts(addresses: Address[]) {
  if (!addresses.length) return;
  const now = new Date().toISOString();
  const db = await database();
  await db.batch(
    addresses.map((a) =>
      db
        .prepare(
          `INSERT INTO contacts (id, data) VALUES (?, ?)
           ON CONFLICT (id) DO UPDATE SET data = json_set(data, '$.count', coalesce(json_extract(data, '$.count'), 0) + 1, '$.lastUsedAt', ?)`,
        )
        .bind(a.address, JSON.stringify({ address: a.address, ...(a.name ? { name: a.name } : {}), count: 1, lastUsedAt: now }), now),
    ),
  );
}
