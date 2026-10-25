import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Stockage des fichiers (pièces jointes, e-mails originaux, images) dans Cloudflare R2
 * (binding FILES). En local, `next dev` simule R2 grâce à initOpenNextCloudflareForDev.
 */

type R2Like = {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string }; size: number } | null>;
  delete(keys: string | string[]): Promise<void>;
};

async function bucket(): Promise<R2Like> {
  const { env } = await getCloudflareContext({ async: true });
  const files = (env as unknown as { FILES?: R2Like }).FILES;
  if (!files) throw new Error("Le stockage de fichiers (binding R2 « FILES ») n'est pas configuré");
  return files;
}

const SAFE_KEY = /^[a-z]+\/[A-Za-z0-9._-]+$/;

function check(key: string) {
  if (!SAFE_KEY.test(key)) throw new Error("Clé de fichier invalide");
  return key;
}

export async function putFile(key: string, data: ArrayBuffer | Uint8Array, contentType: string) {
  await (await bucket()).put(check(key), data, { httpMetadata: { contentType } });
}

export async function getFile(key: string): Promise<{ data: ArrayBuffer; contentType: string; size: number } | null> {
  const obj = await (await bucket()).get(check(key));
  if (!obj) return null;
  return { data: await obj.arrayBuffer(), contentType: obj.httpMetadata?.contentType ?? "application/octet-stream", size: obj.size };
}

export async function deleteFiles(keys: string[]) {
  if (keys.length) await (await bucket()).delete(keys.map(check));
}

export const attachmentKey = (id: string) => `attachments/${id}`;
export const imageKey = (name: string) => `images/${name}`;
/** Logo de l'instance : icon.png (512 px) et apple-icon.png (180 px, fond blanc) */
export const brandKey = (file: "icon.png" | "apple-icon.png") => `brand/${file}`;
