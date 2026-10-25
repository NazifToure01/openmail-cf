import { HttpError, handler } from "@/lib/server";
import { requireAdmin } from "@/lib/session";
import { cleanAppName, getBranding, readLogo, saveBranding } from "@/lib/settings";

/** Personnalisation de l'instance (nom, logo) */
export const GET = handler(async () => Response.json(await getBranding()));

/** Modification (administrateur) : formulaire multipart avec name, logo (fichier) et removeLogo */
export const PUT = handler(async (request: Request) => {
  requireAdmin();
  const form = await request.formData().catch(() => {
    throw new HttpError(400, "Formulaire invalide");
  });
  const logo = await readLogo(form.get("logo"));
  const branding = await saveBranding({
    name: form.has("name") ? cleanAppName(form.get("name")) : undefined,
    logo,
    removeLogo: form.get("removeLogo") === "true",
  });
  return Response.json(branding);
});
