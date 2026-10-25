import "server-only";
import { cache } from "react";
import { APP_NAME_MAX, DEFAULT_BRANDING, type Branding } from "./brand";
import { HttpError } from "./errors";
import { brandKey, deleteFiles, putFile } from "./files";
import { prepareLogo } from "./images";
import { settings } from "./store";

/** Taille maximale du fichier envoyé pour le logo (avant redimensionnement) */
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;

/** Personnalisation de l'instance ; valeurs par défaut si la base n'est pas encore prête */
export const getBranding = cache(async (): Promise<Branding> => {
  try {
    const doc = await settings.get("branding");
    return { name: doc?.name || DEFAULT_BRANDING.name, logoVersion: doc?.logoVersion ?? null };
  } catch (err) {
    console.error("Lecture de la personnalisation impossible", err);
    return DEFAULT_BRANDING;
  }
});

export function cleanAppName(value: unknown): string {
  const name = String(value ?? "").replace(/[\r\n<>]/g, "").trim();
  if (!name) throw new HttpError(400, "Le nom de l'instance est obligatoire");
  if (name.length > APP_NAME_MAX) throw new HttpError(400, `Le nom de l'instance doit faire ${APP_NAME_MAX} caractères au plus`);
  return name;
}

/** Lit et redimensionne le logo envoyé (champ de formulaire) ; null si aucun fichier */
export async function readLogo(value: FormDataEntryValue | null): Promise<{ icon: Uint8Array<ArrayBuffer>; apple: Uint8Array<ArrayBuffer> } | null> {
  if (!value || typeof value === "string" || value.size === 0) return null;
  if (value.size > LOGO_MAX_BYTES) throw new HttpError(413, "Le logo ne doit pas dépasser 5 Mo");
  try {
    return await prepareLogo(new Uint8Array(await value.arrayBuffer()));
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
}

/** Enregistre le nom et, selon le cas, remplace ou retire le logo */
export async function saveBranding(change: {
  name?: string;
  logo?: { icon: Uint8Array<ArrayBuffer>; apple: Uint8Array<ArrayBuffer> } | null;
  removeLogo?: boolean;
}): Promise<Branding> {
  const current = await settings.get("branding");
  let logoVersion = current?.logoVersion ?? null;
  if (change.logo) {
    await putFile(brandKey("icon.png"), change.logo.icon, "image/png");
    await putFile(brandKey("apple-icon.png"), change.logo.apple, "image/png");
    logoVersion = Date.now().toString(36);
  } else if (change.removeLogo && logoVersion) {
    await deleteFiles([brandKey("icon.png"), brandKey("apple-icon.png")]);
    logoVersion = null;
  }
  const name = change.name ?? current?.name ?? DEFAULT_BRANDING.name;
  await settings.put({ id: "branding", name, logoVersion, updatedAt: new Date().toISOString() });
  return { name, logoVersion };
}
