import { storeAttachment } from "@/lib/attachments";
import { MAX_MESSAGE_BYTES } from "@/lib/addresses";
import { HttpError, handler } from "@/lib/server";

/** Une pièce jointe encodée en base64 ne doit pas dépasser la limite de 5 Mo */
const MAX_FILE_BYTES = Math.floor((MAX_MESSAGE_BYTES * 3) / 4) - 16 * 1024;

export const POST = handler(async (request: Request) => {
  const form = await request.formData().catch(() => {
    throw new HttpError(400, "Formulaire invalide");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Aucun fichier reçu");
  if (file.size === 0) throw new HttpError(400, "Le fichier est vide");
  if (file.size > MAX_FILE_BYTES) {
    throw new HttpError(413, `« ${file.name} » dépasse ${(MAX_FILE_BYTES / 1048576).toFixed(1)} Mo (limite Cloudflare : 5 Mo par message)`);
  }
  const attachment = await storeAttachment(await file.arrayBuffer(), {
    filename: file.name.replace(/[\r\n"\\/]/g, "_").slice(0, 200) || "fichier",
    type: file.type || "application/octet-stream",
  });
  return Response.json({ attachment });
});
