import { requireFeature } from "@/lib/ai";
import { indexBacklog } from "@/lib/ai-mail";
import { handler } from "@/lib/server";
import { requireAdmin } from "@/lib/session";

/** Indexe un lot d'anciens messages pour la recherche par le sens (à rappeler tant qu'il en reste) */
export const POST = handler(async () => {
  requireAdmin();
  await requireFeature("search");
  return Response.json(await indexBacklog());
});
