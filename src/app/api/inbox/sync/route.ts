import { isInboxConfigured, syncInbox } from "@/lib/inbound";
import { HttpError, handler } from "@/lib/server";

/** Récupère les e-mails en attente dans le Worker de réception */
export const POST = handler(async () => {
  if (!isInboxConfigured()) return Response.json({ configured: false, imported: 0 });
  try {
    return Response.json({ configured: true, imported: await syncInbox() });
  } catch (err) {
    throw new HttpError(502, (err as Error).message);
  }
});
