import { requireFeature } from "@/lib/ai";
import { summarizeMessage } from "@/lib/ai-mail";
import { handler } from "@/lib/server";
import { currentUser } from "@/lib/session";
import { visibleMessage } from "../message";

/** Résumé du message (mis en cache ; ?refresh pour le recalculer) */
export const POST = handler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireFeature("summary");
  const message = await visibleMessage(params);
  if (message.ai?.summary && !new URL(request.url).searchParams.has("refresh")) {
    return Response.json({ summary: message.ai.summary, cached: true });
  }
  return Response.json({ summary: await summarizeMessage(message, currentUser()), cached: false });
});
