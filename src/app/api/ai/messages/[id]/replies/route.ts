import { requireFeature } from "@/lib/ai";
import { suggestReplies, textToEditorHtml } from "@/lib/ai-mail";
import { HttpError, handler } from "@/lib/server";
import { currentUser } from "@/lib/session";
import { visibleMessage } from "../message";

/** Trois réponses courtes proposées pour un message reçu */
export const POST = handler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireFeature("summary");
  const message = await visibleMessage(params);
  if (message.direction !== "in") throw new HttpError(400, "Les réponses suggérées concernent les messages reçus");
  const replies = await suggestReplies(message, currentUser());
  return Response.json({ replies: replies.map((text) => ({ text, html: textToEditorHtml(text) })) });
});
