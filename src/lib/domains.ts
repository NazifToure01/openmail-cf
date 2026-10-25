import "server-only";
import { HttpError } from "./errors";
import { canAccessDomain, currentUser } from "./session";

/**
 * Domaine de l'instance : une instance gère un seul domaine, MAIL_DOMAIN. L'id de sa zone
 * (CLOUDFLARE_ZONE_ID, renseigné par `npm run deploy`) sert à créer les règles de réception.
 * Pour un autre domaine, déployez une autre instance (PROJECT_NAME différent).
 */

export type MailDomain = { name: string; zoneId: string | null };

export function instanceDomain(): MailDomain | null {
  const name = (process.env.MAIL_DOMAIN || "").trim().toLowerCase();
  return name ? { name, zoneId: process.env.CLOUDFLARE_ZONE_ID?.trim() || null } : null;
}

/** Domaines configurés (le domaine de l'instance) */
export async function listDomains(): Promise<MailDomain[]> {
  const domain = instanceDomain();
  return domain ? [domain] : [];
}

/** Domaine de travail, vérifié contre les droits de l'utilisateur connecté */
export async function currentDomain(): Promise<MailDomain> {
  const domain = instanceDomain();
  if (!domain) throw new HttpError(500, "MAIL_DOMAIN n'est pas configuré sur le serveur");
  if (!canAccessDomain(currentUser(), domain.name)) throw new HttpError(403, `Vous n'avez pas accès à ${domain.name}`, "domain_forbidden");
  return domain;
}
