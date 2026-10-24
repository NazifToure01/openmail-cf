import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, tokenFromRequest, verifySessionToken } from "./auth";
import { mailboxAddresses } from "./mailboxes";
import { HttpError } from "./errors";
import { users, type User } from "./store";
import type { Message } from "./types";

/** Utilisateur connecté, tel qu'exposé à l'API (sans le hash du mot de passe) */
export type SessionUser = Omit<User, "passwordHash">;

const scope = new AsyncLocalStorage<{ user: SessionUser }>();

export function publicUser(u: User | SessionUser): SessionUser {
  const { passwordHash: _hash, ...rest } = u as User;
  void _hash;
  return rest;
}

/** Lit et valide la session de la requête (jeton signé + utilisateur actif + version du jeton) */
export async function authenticate(explicitToken?: string): Promise<SessionUser> {
  const [h, c] = await Promise.all([headers(), cookies()]);
  const payload = await verifySessionToken(explicitToken ?? tokenFromRequest(h, c.get(SESSION_COOKIE)?.value));
  if (!payload) throw new HttpError(401, "Non authentifié");
  const user = await users.get(payload.uid);
  if (!user || user.disabled || user.tokenVersion !== payload.v) throw new HttpError(401, "Session expirée");
  return publicUser(user);
}

export function runAsUser<T>(user: SessionUser, fn: () => Promise<T>): Promise<T> {
  return scope.run({ user }, fn);
}

export function currentUser(): SessionUser {
  const store = scope.getStore();
  if (!store) throw new HttpError(401, "Non authentifié");
  return store.user;
}

export function requireAdmin(): SessionUser {
  const user = currentUser();
  if (user.role !== "admin") throw new HttpError(403, "Réservé aux administrateurs");
  return user;
}

/* ---------- Droits ---------- */

/** Boîtes accessibles sur un domaine : "*" (toutes), une liste d'adresses, ou null (aucun accès) */
export function mailboxAccess(user: SessionUser, domain: string): "*" | string[] | null {
  if (user.role === "admin") return "*";
  const entry = user.access.find((a) => a.domain === domain);
  if (!entry) return null;
  return entry.mailboxes === "*" ? "*" : entry.mailboxes.map((m) => m.toLowerCase());
}

export function canAccessDomain(user: SessionUser, domain: string) {
  return mailboxAccess(user, domain) !== null;
}

/** Peut-on lire / écrire avec cette adresse (expéditeur, boîte) ? */
export function canUseAddress(user: SessionUser, domain: string, address: string) {
  const access = mailboxAccess(user, domain);
  if (!access) return false;
  if (!address.toLowerCase().endsWith(`@${domain}`)) return false;
  return access === "*" || access.includes(address.toLowerCase());
}

/** Le message appartient-il à une boîte accessible ? */
export function canSeeMessage(user: SessionUser, m: Pick<Message, "domain" | "direction" | "from" | "to" | "cc" | "deliveredTo">) {
  if (!m.domain) return user.role === "admin";
  const access = mailboxAccess(user, m.domain);
  if (!access) return false;
  if (access === "*") return true;
  return mailboxAddresses(m as Message, m.domain).some((a) => access.includes(a));
}
