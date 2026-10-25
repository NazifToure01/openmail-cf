import { requireFeature } from "@/lib/ai";
import { triageMessage } from "@/lib/ai-mail";
import { HttpError, handler } from "@/lib/server";
import { currentUser } from "@/lib/session";
import { visibleMessage } from "../message";

/** Relance le tri d'un message reçu (catégorie, priorité, hameçonnage, événements) */
export const POST = handler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireFeature("triage");
  const message = await visibleMessage(params);
  if (message.direction !== "in") throw new HttpError(400, "Le tri concerne les messages reçus");
  return Response.json({ ai: await triageMessage(message, currentUser().id) });
});
