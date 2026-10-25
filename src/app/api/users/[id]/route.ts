import { hashPassword, passwordProblem } from "@/lib/auth";
import { listDomains } from "@/lib/domains";
import { HttpError, handler, readJson } from "@/lib/server";
import { publicUser, requireAdmin } from "@/lib/session";
import { users, type User } from "@/lib/store";
import { cleanAccess } from "@/lib/user-input";

type Ctx = { params: Promise<{ id: string }> };

/** Modification : { name?, role?, access?, disabled?, password? } — un nouveau mot de passe déconnecte le compte */
export const PATCH = handler(async (request: Request, { params }: Ctx) => {
  const admin = requireAdmin();
  const { id } = await params;
  const body = await readJson<Partial<User> & { password?: string }>(request);
  const current = await users.get(id);
  if (!current) throw new HttpError(404, "Compte introuvable");

  const set: Partial<User> = { updatedAt: new Date().toISOString() };
  let revoke = false;
  if (typeof body.name === "string" && body.name.trim()) set.name = body.name.trim().slice(0, 120);
  if (body.role === "admin" || body.role === "member") {
    if (id === admin.id && body.role !== "admin") throw new HttpError(400, "Vous ne pouvez pas retirer vos propres droits d'administrateur");
    set.role = body.role;
  }
  if (body.access !== undefined) set.access = cleanAccess(body.access, (await listDomains()).map((d) => d.name));
  if (typeof body.disabled === "boolean") {
    if (id === admin.id && body.disabled) throw new HttpError(400, "Vous ne pouvez pas désactiver votre propre compte");
    set.disabled = body.disabled;
    revoke ||= body.disabled;
  }
  if (body.password) {
    const problem = passwordProblem(body.password);
    if (problem) throw new HttpError(400, problem);
    set.passwordHash = await hashPassword(body.password);
    revoke = true;
  }
  const user = await users.update(id, { set, inc: revoke ? { tokenVersion: 1 } : {} });
  return Response.json({ user: user ? publicUser(user) : null });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const admin = requireAdmin();
  const { id } = await params;
  if (id === admin.id) throw new HttpError(400, "Vous ne pouvez pas supprimer votre propre compte");
  await users.remove(id);
  return Response.json({ ok: true });
});
