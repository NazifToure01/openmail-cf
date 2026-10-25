import { createHash, timingSafeEqual } from "node:crypto";
import { hashPassword, passwordProblem } from "@/lib/auth";
import { isValidEmail } from "@/lib/addresses";
import { HttpError, publicHandler } from "@/lib/server";
import { cleanAppName, readLogo, saveBranding } from "@/lib/settings";
import { users, type User } from "@/lib/store";

/**
 * Premier compte administrateur, possible uniquement tant qu'aucun compte n'existe.
 * Protégé par APP_PASSWORD (mot de passe d'installation défini par la personne qui déploie).
 * Formulaire multipart : identifiants du compte, puis nom de l'instance et logo (facultatifs).
 */
export const GET = publicHandler(async () => Response.json({ needsSetup: (await users.count()) === 0 }));

const digest = (v: string) => createHash("sha256").update(v).digest();

export const POST = publicHandler(async (request: Request) => {
  if ((await users.count()) > 0) throw new HttpError(409, "Un compte administrateur existe déjà");
  const setupSecret = process.env.APP_PASSWORD;
  if (!setupSecret) throw new HttpError(500, "APP_PASSWORD n'est pas configuré sur le serveur");

  const form = await request.formData().catch(() => {
    throw new HttpError(400, "Formulaire invalide");
  });
  const field = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : "";
  };
  if (!timingSafeEqual(digest(field("setupPassword")), digest(setupSecret))) {
    await new Promise((r) => setTimeout(r, 800));
    throw new HttpError(401, "Mot de passe d'installation incorrect");
  }
  const email = field("email").trim().toLowerCase();
  if (!isValidEmail(email)) throw new HttpError(400, "Adresse e-mail invalide");
  const problem = passwordProblem(field("password"));
  if (problem) throw new HttpError(400, problem);
  // Personnalisation validée avant de créer le compte : une erreur laisse l'installation recommençable
  const appName = field("appName").trim() ? cleanAppName(field("appName")) : undefined;
  const logo = await readLogo(form.get("logo"));

  const now = new Date().toISOString();
  const admin: User = {
    id: email,
    email,
    name: field("name").trim().slice(0, 120) || email,
    passwordHash: await hashPassword(field("password")),
    role: "admin",
    access: [],
    tokenVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  if (appName || logo) await saveBranding({ name: appName, logo });
  await users.insert(admin);
  return Response.json({ ok: true });
});
