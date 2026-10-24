import "server-only";
import { belongsToDomain } from "./addresses";
import { HttpError } from "./errors";
import type { Identity, Signature } from "./types";

export function cleanIdentity(body: Partial<Identity>, domain: string) {
  const address = String(body.address ?? "").trim().toLowerCase();
  if (!belongsToDomain(address, domain)) {
    throw new HttpError(400, `L'adresse doit se terminer par @${domain}`);
  }
  return {
    address,
    name: String(body.name ?? "").trim().replace(/[<>"\r\n]/g, "").slice(0, 120),
    signatureId: typeof body.signatureId === "string" && body.signatureId ? body.signatureId : null,
    isDefault: Boolean(body.isDefault),
  };
}

export function cleanSignature(body: Partial<Signature>) {
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) throw new HttpError(400, "Donnez un nom à la signature");
  const html = String(body.html ?? "");
  if (html.length > 200_000) throw new HttpError(413, "Signature trop volumineuse (utilisez des images hébergées par URL)");
  return { name, html };
}
