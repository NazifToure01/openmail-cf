import "server-only";
import { database, placeholders } from "./db";
import { attachmentKey, deleteFiles, getFile, putFile } from "./files";
import { attachments, type StoredAttachment } from "./store";
import type { AttachmentMeta } from "./types";

/** Enregistre un fichier (pièce jointe, image intégrée, e-mail original) et ses métadonnées */
export async function storeAttachment(
  data: ArrayBuffer | Uint8Array,
  meta: Omit<AttachmentMeta, "id" | "size">,
): Promise<AttachmentMeta> {
  const stored: AttachmentMeta = { id: crypto.randomUUID(), size: data.byteLength, ...meta };
  await putFile(attachmentKey(stored.id), data, stored.type);
  await attachments.insert({ ...stored, createdAt: new Date().toISOString() });
  return stored;
}

export async function findAttachments(ids: string[]): Promise<StoredAttachment[]> {
  if (!ids.length) return [];
  const docs: StoredAttachment[] = [];
  for (const chunk of chunks(ids)) docs.push(...(await attachments.find(`id IN (${placeholders(chunk)})`, chunk)));
  // Conserve l'ordre demandé
  return ids.flatMap((id) => docs.filter((d) => d.id === id));
}

export async function readAttachment(id: string) {
  const meta = await attachments.get(id);
  if (!meta) return null;
  const file = await getFile(attachmentKey(id));
  return file ? { meta, data: file.data } : null;
}

/** Supprime les fichiers qui ne sont plus référencés par aucun message (et plus vieux qu'un jour) */
export async function collectUnusedAttachments() {
  const limit = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const candidates = await attachments.find("created_at < ?", [limit]);
  if (!candidates.length) return;
  // Fichiers encore référencés : pièces jointes des messages et e-mails originaux
  const { results } = await (await database())
    .prepare(
      `SELECT json_extract(j.value, '$.id') AS id FROM messages m, json_each(m.data, '$.attachments') j
       UNION SELECT raw_id FROM messages WHERE raw_id IS NOT NULL`,
    )
    .all<{ id: string }>();
  const used = new Set(results.map((r) => r.id));
  const unused = candidates.map((c) => c.id).filter((id) => !used.has(id));
  if (!unused.length) return;
  await deleteFiles(unused.map(attachmentKey));
  for (const chunk of chunks(unused)) await attachments.removeWhere(`id IN (${placeholders(chunk)})`, chunk);
}

/** Listes IN (…) découpées : D1 accepte 100 paramètres par requête */
function chunks<T>(list: T[], size = 90): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
