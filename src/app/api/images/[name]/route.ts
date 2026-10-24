import { currentDomain } from "@/lib/domains";
import { deleteFiles, imageKey } from "@/lib/files";
import { HttpError, handler } from "@/lib/server";
import { images } from "@/lib/store";

/**
 * Retire une image de la bibliothèque et de l'hébergement.
 * Elle disparaît aussi des e-mails déjà envoyés qui l'affichent.
 */
export const DELETE = handler(async (_req: Request, { params }: { params: Promise<{ name: string }> }) => {
  const { name } = await params;
  if (!/^[a-f0-9-]{36}\.(png|jpg|gif)$/.test(name)) throw new HttpError(400, "Nom d'image invalide");
  const domain = (await currentDomain()).name;
  const removed = await images.remove(name, "domain = ?", [domain]);
  if (removed) await deleteFiles([imageKey(name)]);
  return Response.json({ ok: true });
});
