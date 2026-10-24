import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth";
import { HttpError, handler, readJson } from "@/lib/server";
import { currentUser, publicUser } from "@/lib/session";
import { users, type User } from "@/lib/store";

/** Profil de l'utilisateur connecté */
export const GET = handler(async () => Response.json({ user: currentUser() }));

/** Modifier son nom ou son mot de passe : { name?, currentPassword?, newPassword? } */
export const PATCH = handler(async (request: Request) => {
  const me = currentUser();
  const body = await readJson<{ name?: string; currentPassword?: string; newPassword?: string }>(request);
  const set: Partial<User> = { updatedAt: new Date().toISOString() };
  const inc: { tokenVersion?: number } = {};
  if (typeof body.name === "string" && body.name.trim()) set.name = body.name.trim().slice(0, 120);
  if (body.newPassword !== undefined) {
    const full = await users.get(me.id);
    if (!full || !(await verifyPassword(String(body.currentPassword ?? ""), full.passwordHash))) {
      throw new HttpError(400, "Mot de passe actuel incorrect");
    }
    const problem = passwordProblem(String(body.newPassword));
    if (problem) throw new HttpError(400, problem);
    set.passwordHash = await hashPassword(String(body.newPassword));
    // Les autres appareils sont déconnectés
    inc.tokenVersion = 1;
  }
  const user = await users.update(me.id, { set, inc });
  return Response.json({ user: user ? publicUser(user) : null, reauth: Boolean(inc.tokenVersion) });
});
