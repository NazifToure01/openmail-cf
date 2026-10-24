import { hashPassword, passwordProblem } from "@/lib/auth";
import { isValidEmail } from "@/lib/addresses";
import { listDomains } from "@/lib/domains";
import { HttpError, handler, readJson } from "@/lib/server";
import { publicUser, requireAdmin } from "@/lib/session";
import { DuplicateError } from "@/lib/db";
import { users, type User } from "@/lib/store";
import { cleanAccess } from "@/lib/user-input";

/** Liste des comptes (administrateurs uniquement) */
export const GET = handler(async () => {
  requireAdmin();
  const list = await users.find(undefined, [], "ORDER BY name");
  return Response.json({ users: list.map(publicUser) });
});

/** Création : { email, name, password, role, access } */
export const POST = handler(async (request: Request) => {
  requireAdmin();
  const body = await readJson<Partial<User> & { password?: string }>(request);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) throw new HttpError(400, "Adresse e-mail invalide");
  const problem = passwordProblem(String(body.password ?? ""));
  if (problem) throw new HttpError(400, problem);

  const now = new Date().toISOString();
  const user: User = {
    id: email,
    email,
    name: String(body.name ?? "").trim().slice(0, 120) || email,
    passwordHash: await hashPassword(String(body.password)),
    role: body.role === "admin" ? "admin" : "member",
    access: cleanAccess(body.access, (await listDomains()).map((d) => d.name)),
    tokenVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await users.insert(user);
  } catch (err) {
    if (err instanceof DuplicateError) throw new HttpError(409, "Un compte existe déjà avec cet e-mail");
    throw err;
  }
  return Response.json({ user: publicUser(user) });
});
