import { collectUnusedAttachments } from "@/lib/attachments";
import { HttpError, handler, readJson, summarize } from "@/lib/server";
import { canSeeMessage, currentUser } from "@/lib/session";
import { messages } from "@/lib/store";
import type { Message } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const message = await messages.get(id, { bodies: true });
  if (!message || !canSeeMessage(currentUser(), message)) throw new HttpError(404, "Message introuvable");
  return Response.json({ message });
});

/** { starred?: boolean, read?: boolean, action?: "trash" | "restore" } */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const body = await readJson<{ starred?: boolean; read?: boolean; action?: "trash" | "restore" }>(req);
  const m = await messages.get(id);
  if (!m || !canSeeMessage(currentUser(), m)) throw new HttpError(404, "Message introuvable");

  const set: Partial<Message> = {};
  const unset: (keyof Message & string)[] = [];
  if (typeof body.starred === "boolean") set.starred = body.starred;
  if (typeof body.read === "boolean" && m.direction === "in") set.read = body.read;
  if (body.action === "trash" && m.folder !== "trash") {
    set.previousFolder = m.folder;
    set.folder = "trash";
  }
  if (body.action === "restore" && m.folder === "trash") {
    set.folder = m.previousFolder ?? "sent";
    unset.push("previousFolder");
  }
  if (Object.keys(set).length || unset.length) await messages.update(id, { set, unset });
  const updated = { ...m, ...set };
  if (unset.length) delete updated.previousFolder;
  return Response.json({ message: summarize(updated) });
});

/** Suppression définitive (uniquement depuis la corbeille ou les brouillons) */
export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const m = await messages.get(id);
  if (!m || !canSeeMessage(currentUser(), m)) throw new HttpError(404, "Message introuvable");
  if (m.folder !== "trash" && m.folder !== "drafts") {
    throw new HttpError(400, "Placez d'abord le message dans la corbeille");
  }
  await messages.remove(id);
  await collectUnusedAttachments();
  return Response.json({ ok: true });
});
