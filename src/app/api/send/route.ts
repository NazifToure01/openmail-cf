import { findAttachments } from "@/lib/attachments";
import { attachmentKey, getFile } from "@/lib/files";
import { messages, signatures } from "@/lib/store";
import { currentDomain } from "@/lib/domains";
import { canUseAddress, currentUser } from "@/lib/session";
import { CloudflareError, sendWithCloudflare, toCloudflareAddress } from "@/lib/cloudflare";
import { MAX_MESSAGE_BYTES } from "@/lib/addresses";
import { buildEmailHtml, htmlToText } from "@/lib/email-html";
import { HttpError, handler, normalizeCompose, readJson, rememberContacts, summarize } from "@/lib/server";
import type { AttachmentMeta, Message } from "@/lib/types";

export const POST = handler(async (request: Request) => {
  const domain = (await currentDomain()).name;
  const input = normalizeCompose(await readJson(request), true, domain);
  if (input.from.address && !canUseAddress(currentUser(), domain, input.from.address)) {
    throw new HttpError(403, `Vous n'êtes pas autorisé à écrire depuis ${input.from.address}`);
  }

  const [signature, stored] = await Promise.all([
    input.signatureId ? signatures.get(input.signatureId) : null,
    findAttachments(input.attachmentIds),
  ]);
  const signatureHtml = signature?.html ?? null;
  const attachments: AttachmentMeta[] = stored.map(({ id, filename, type, size }) => ({ id, filename, type, size }));
  if (attachments.length !== input.attachmentIds.length) {
    throw new HttpError(400, "Une pièce jointe est introuvable, retirez-la et ajoutez-la à nouveau");
  }

  const html = buildEmailHtml({ bodyHtml: input.bodyHtml, signatureHtml, quotedHtml: input.quotedHtml });
  const text = htmlToText(html);

  const files = await Promise.all(
    attachments.map(async (a) => {
      const file = await getFile(attachmentKey(a.id));
      if (!file) throw new HttpError(400, `La pièce jointe « ${a.filename} » est introuvable, ajoutez-la à nouveau`);
      return {
      content: Buffer.from(file.data).toString("base64"),
      filename: a.filename,
      type: a.type || "application/octet-stream",
      disposition: "attachment" as const,
      };
    }),
  );
  const size = Buffer.byteLength(html) + Buffer.byteLength(text) + files.reduce((s, f) => s + f.content.length, 0);
  if (size > MAX_MESSAGE_BYTES) {
    throw new HttpError(413, `Message trop volumineux (${(size / 1048576).toFixed(1)} Mo encodé, maximum 5 Mo)`);
  }

  const now = new Date().toISOString();
  const message: Message = {
    id: crypto.randomUUID(),
    folder: "sent",
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
    html,
    text,
    attachments,
    starred: false,
    createdAt: now,
    updatedAt: now,
  };

  try {
    message.result = await sendWithCloudflare({
      from: toCloudflareAddress(input.from),
      to: input.to.map(toCloudflareAddress),
      cc: input.cc.length ? input.cc.map((a) => a.address) : undefined,
      bcc: input.bcc.length ? input.bcc.map((a) => a.address) : undefined,
      reply_to: input.replyTo?.address,
      subject: input.subject,
      html,
      text,
      attachments: files.length ? files : undefined,
      headers: input.inReplyTo
        ? { "In-Reply-To": input.inReplyTo, References: input.references || input.inReplyTo }
        : undefined,
    });
    message.messageId = message.result.message_id;
  } catch (err) {
    if (!(err instanceof CloudflareError)) throw err;
    // Le contenu est conservé en brouillon (avec l'erreur) pour corriger et renvoyer
    const fields: Message = { ...message, folder: "drafts", error: err.message };
    delete fields.html;
    delete fields.text;
    let draftId = message.id;
    const existing = input.draftId ? await messages.first("id = ? AND folder = 'drafts'", [input.draftId]) : null;
    if (existing) {
      draftId = existing.id;
      const { id: _ignored, ...rest } = fields;
      void _ignored;
      await messages.update(existing.id, { set: { ...rest, createdAt: existing.createdAt } });
    } else {
      await messages.insert(fields);
    }
    return Response.json({ error: err.message, draftId }, { status: 502 });
  }

  message.sentAt = new Date().toISOString();
  await messages.insert(message);
  if (input.draftId) await messages.remove(input.draftId, "folder = 'drafts'");
  await rememberContacts([...input.to, ...input.cc, ...input.bcc]);
  return Response.json({ message: summarize(message) });
});
