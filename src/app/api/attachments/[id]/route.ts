import { readAttachment } from "@/lib/attachments";
import { HttpError, handler } from "@/lib/server";

/** Pièce jointe (ou image intégrée d'un e-mail reçu), réservée aux utilisateurs connectés */
export const GET = handler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new HttpError(400, "Identifiant invalide");
  const found = await readAttachment(id);
  if (!found) throw new HttpError(404, "Pièce jointe introuvable");
  const download = new URL(request.url).searchParams.has("download");
  return new Response(found.data, {
    headers: {
      "Content-Type": found.meta.type,
      "Content-Length": String(found.data.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(found.meta.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
});
