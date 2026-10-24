import { findAttachments } from "@/lib/attachments";
import { currentDomain } from "@/lib/domains";
import { canUseAddress, currentUser } from "@/lib/session";
import { HttpError, handler, normalizeCompose, readJson, summarize } from "@/lib/server";
import { messages } from "@/lib/store";
import type { Message } from "@/lib/types";

/** Crée ou met à jour un brouillon */
export const POST = handler(async (request: Request) => {
  const domain = (await currentDomain()).name;
  const input = normalizeCompose(await readJson(request), false, domain);
  if (input.from.address && !canUseAddress(currentUser(), domain, input.from.address)) {
    throw new HttpError(403, `Vous n'êtes pas autorisé à écrire depuis ${input.from.address}`);
  }
  const now = new Date().toISOString();
  const attachments = (await findAttachments(input.attachmentIds)).map(({ id, filename, type, size }) => ({ id, filename, type, size }));

  const fields = {
    domain,
    from: input.from,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    replyTo: input.replyTo,
    subject: input.subject,
    bodyHtml: input.bodyHtml,
    signatureId: input.signatureId,
    quotedHtml: input.quotedHtml,
    inReplyTo: input.inReplyTo ?? undefined,
    references: input.references ?? undefined,
    attachments,
    updatedAt: now,
  };

  if (input.draftId) {
    const updated = await messages.update(input.draftId, { set: fields, unset: ["error"] }, "folder = 'drafts'");
    if (updated) return Response.json({ message: summarize(updated) });
  }
  const draft: Message = { id: crypto.randomUUID(), folder: "drafts", starred: false, createdAt: now, ...fields };
  await messages.insert(draft);
  return Response.json({ message: summarize(draft) });
});
