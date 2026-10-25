import { createHash, timingSafeEqual } from "node:crypto";
import { sendDigests } from "@/lib/ai-mail";
import { HttpError, publicHandler } from "@/lib/server";

const digest = (v: string) => createHash("sha256").update(v).digest();

/**
 * Appelé chaque heure par le Worker de réception (tâche planifiée) : envoie le résumé quotidien
 * quand c'est l'heure choisie dans Réglages → IA. Authentifié par INBOX_SECRET.
 */
export const POST = publicHandler(async (request: Request) => {
  const secret = process.env.INBOX_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!secret || !timingSafeEqual(digest(token), digest(secret))) throw new HttpError(401, "Non autorisé");
  return Response.json(await sendDigests());
});
