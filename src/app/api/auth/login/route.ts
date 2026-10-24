import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken, verifyPassword } from "@/lib/auth";
import { HttpError, publicHandler, readJson } from "@/lib/server";
import { publicUser } from "@/lib/session";
import { users } from "@/lib/store";

/**
 * Connexion : { email, password } → { token, user }
 * Le web reçoit aussi le cookie de session ; l'app mobile garde le jeton (stockage sécurisé).
 */
export const POST = publicHandler(async (request: Request) => {
  const body = await readJson<{ email?: unknown; password?: unknown }>(request);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const user = email ? await users.get(email) : null;
  const valid = user && !user.disabled && (await verifyPassword(password, user.passwordHash));
  if (!valid || !user) {
    // Ralentit les tentatives par force brute
    await new Promise((r) => setTimeout(r, 800));
    throw new HttpError(401, "E-mail ou mot de passe incorrect");
  }

  const token = await createSessionToken(user.id, user.tokenVersion);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return Response.json({ token, user: publicUser(user) });
});
