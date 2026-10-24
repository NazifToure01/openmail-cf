import { readAttachment } from "@/lib/attachments";
import { HttpError, publicHandler } from "@/lib/server";
import { authenticate } from "@/lib/session";

/**
 * Pièce jointe. Authentification par session, ou par « ?access_token= » : les WebView de l'app
 * mobile ne peuvent pas ajouter d'en-tête aux images intégrées d'un e-mail.
 */
export const GET = publicHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await authenticate(new URL(request.url).searchParams.get("access_token") ?? undefined);
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
