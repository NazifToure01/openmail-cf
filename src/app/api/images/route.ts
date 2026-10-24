import { currentDomain } from "@/lib/domains";
import { imageKey, putFile } from "@/lib/files";
import { prepareImage } from "@/lib/images";
import { HttpError, handler } from "@/lib/server";
import { images } from "@/lib/store";
import type { LibraryImage } from "@/lib/types";

/**
 * Images insérées dans les e-mails : préparées (taille, format), stockées dans R2 et servies
 * publiquement par /img/<nom> — l'adresse que lisent les clients mail des destinataires.
 */
const MAX_UPLOAD = 15 * 1024 * 1024;

/** Bibliothèque « Mes images » du domaine choisi, la plus récente d'abord */
export const GET = handler(async () => {
  const domain = (await currentDomain()).name;
  const list = await images.find("domain = ?", [domain], "ORDER BY created_at DESC");
  return Response.json({ images: list });
});

export const POST = handler(async (request: Request) => {
  const domain = (await currentDomain()).name;
  const form = await request.formData().catch(() => {
    throw new HttpError(400, "Formulaire invalide");
  });
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Aucune image reçue");
  if (!file.type.startsWith("image/")) throw new HttpError(415, "Ce fichier n'est pas une image");
  if (file.size > MAX_UPLOAD) throw new HttpError(413, "Image trop volumineuse (15 Mo maximum)");

  let prepared;
  try {
    prepared = await prepareImage(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    throw new HttpError(415, (err as Error).message);
  }

  // Même image déjà importée : on réutilise l'adresse existante
  const digest = await crypto.subtle.digest("SHA-256", prepared.data);
  const hash = Buffer.from(digest).toString("hex");
  const existing = await images.first("domain = ? AND hash = ?", [domain, hash]);
  if (existing) return Response.json({ ...existing, reused: true });

  const name = `${crypto.randomUUID()}.${prepared.ext}`;
  await putFile(imageKey(name), prepared.data, prepared.type);
  const origin = (process.env.PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/+$/, "");
  const image: LibraryImage = {
    name,
    url: `${origin}/img/${name}`,
    filename: file.name.slice(0, 200) || name,
    width: prepared.width,
    height: prepared.height,
    size: prepared.data.byteLength,
    hash,
    domain,
    createdAt: new Date().toISOString(),
  };
  await images.insert(image);
  return Response.json(image);
});
