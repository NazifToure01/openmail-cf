import { createHash, timingSafeEqual } from "node:crypto";
import { hashPassword, passwordProblem } from "@/lib/auth";
import { isValidEmail } from "@/lib/addresses";
import { HttpError, publicHandler, readJson } from "@/lib/server";
import { users, type User } from "@/lib/store";

/**
 * Premier compte administrateur, possible uniquement tant qu'aucun compte n'existe.
 * Protégé par APP_PASSWORD (mot de passe d'installation défini par la personne qui déploie).
 */
export const GET = publicHandler(async () => Response.json({ needsSetup: (await users.count()) === 0 }));

const digest = (v: string) => createHash("sha256").update(v).digest();

export const POST = publicHandler(async (request: Request) => {
  if ((await users.count()) > 0) throw new HttpError(409, "Un compte administrateur existe déjà");
  const setupSecret = process.env.APP_PASSWORD;
  if (!setupSecret) throw new HttpError(500, "APP_PASSWORD n'est pas configuré sur le serveur");

  const body = await readJson<{ setupPassword?: string; email?: string; name?: string; password?: string }>(request);
  if (!timingSafeEqual(digest(String(body.setupPassword ?? "")), digest(setupSecret))) {
    await new Promise((r) => setTimeout(r, 800));
    throw new HttpError(401, "Mot de passe d'installation incorrect");
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) throw new HttpError(400, "Adresse e-mail invalide");
  const problem = passwordProblem(String(body.password ?? ""));
  if (problem) throw new HttpError(400, problem);

  const now = new Date().toISOString();
  const admin: User = {
    id: email,
    email,
    name: String(body.name ?? "").trim().slice(0, 120) || email,
    passwordHash: await hashPassword(String(body.password)),
    role: "admin",
    access: [],
    tokenVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  await users.insert(admin);
  return Response.json({ ok: true });
});
