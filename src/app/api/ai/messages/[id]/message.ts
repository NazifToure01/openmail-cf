import "server-only";
import { HttpError } from "@/lib/server";
import { canSeeMessage, currentUser } from "@/lib/session";
import { messages } from "@/lib/store";

/** Message visible par l'utilisateur connecté (corps compris), sinon 404 */
export async function visibleMessage(params: Promise<{ id: string }>) {
  const { id } = await params;
  const message = await messages.get(id, { bodies: true });
  if (!message || !canSeeMessage(currentUser(), message)) throw new HttpError(404, "Message introuvable");
  return message;
}
