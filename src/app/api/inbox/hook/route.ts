import { createHash, timingSafeEqual } from "node:crypto";
import { syncInbox } from "@/lib/inbound";
import { HttpError, publicHandler } from "@/lib/server";

const digest = (v: string) => createHash("sha256").update(v).digest();

/**
 * Appelé par le Worker de réception dès qu'un e-mail est stocké : l'app l'importe aussitôt
 * et envoie les notifications push. Authentifié par INBOX_SECRET.
 */
export const POST = publicHandler(async (request: Request) => {
  const secret = process.env.INBOX_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!secret || !timingSafeEqual(digest(token), digest(secret))) throw new HttpError(401, "Non autorisé");
  return Response.json({ imported: await syncInbox() });
});
