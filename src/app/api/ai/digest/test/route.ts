import { aiProvider } from "@/lib/ai";
import { sendDigests } from "@/lib/ai-mail";
import { HttpError, handler } from "@/lib/server";
import { requireAdmin } from "@/lib/session";

/** Envoie tout de suite le résumé à l'administrateur connecté (aperçu) */
export const POST = handler(async () => {
  const admin = requireAdmin();
  if (!aiProvider()) throw new HttpError(503, "L'IA n'est pas configurée sur ce serveur (AI_PROVIDER)", "ai_disabled");
  return Response.json(await sendDigests(admin));
});
