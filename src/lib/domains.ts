import "server-only";
import { cookies, headers } from "next/headers";
import { HttpError } from "./errors";
import { canAccessDomain, currentUser } from "./session";

/**
 * Domaines d'envoi disponibles.
 *
 * 1. Liste fixe : MAIL_DOMAINS="example.com=<zone id>,example.org=<zone id>" (l'id de zone est
 *    facultatif, il sert à créer les règles de réception). Ancien format : MAIL_DOMAIN + CLOUDFLARE_ZONE_ID.
 * 2. Découverte automatique : si le token (CLOUDFLARE_ROUTING_TOKEN ou CLOUDFLARE_API_TOKEN) peut lire
 *    les zones, tous les domaines du compte dont l'envoi d'e-mails est activé sont ajoutés.
 */

export type MailDomain = { name: string; zoneId: string | null };

export const DOMAIN_COOKIE = "mb_domain";

function fromEnv(): MailDomain[] {
  const list = (process.env.MAIL_DOMAINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, zoneId] = entry.split("=").map((x) => x.trim());
      return { name: name.toLowerCase(), zoneId: zoneId || null };
    });
  if (list.length) return list;
  const legacy = (process.env.MAIL_DOMAIN || "").trim().toLowerCase();
  return legacy ? [{ name: legacy, zoneId: process.env.CLOUDFLARE_ZONE_ID || null }] : [];
}

const state = globalThis as unknown as { __mbDomains?: { at: number; list: MailDomain[] } };
const CACHE_MS = 10 * 60 * 1000;

/**
 * Découverte : liste des zones du compte (permission « Zone : Read »), puis état de l'envoi de chaque
 * zone (lisible avec le token d'envoi). Chaque appel essaie les tokens disponibles jusqu'à en trouver un autorisé.
 */
async function discover(): Promise<MailDomain[]> {
  const tokens = [process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ROUTING_TOKEN, process.env.CLOUDFLARE_ANALYTICS_TOKEN]
    .filter((t): t is string => Boolean(t))
    .filter((t, i, all) => all.indexOf(t) === i);
  if (!tokens.length) return [];
  const base = process.env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4";
  const get = async <T,>(path: string): Promise<T | null> => {
    for (const token of tokens) {
      const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { success?: boolean; result?: T } | null;
      // Une liste vide peut signifier « pas d'accès » : on tente alors le token suivant
      if (res.ok && json?.success && !(Array.isArray(json.result) && json.result.length === 0)) return json.result ?? null;
    }
    return null;
  };
  const zones = (await get<{ id: string; name: string }[]>("/zones?per_page=50&status=active")) ?? [];
  const found = await Promise.all(
    zones.map(async (z) => {
      const subs = await get<{ name: string; enabled: boolean }[]>(`/zones/${z.id}/email/sending/subdomains`);
      const domain: MailDomain = { name: z.name.toLowerCase(), zoneId: z.id };
      return subs?.some((s) => s.enabled && s.name === z.name) ? domain : null;
    }),
  );
  return found.filter((d): d is MailDomain => d !== null);
}

/** Domaines configurés + découverts (mis en cache 10 minutes) */
export async function listDomains(refresh = false): Promise<MailDomain[]> {
  if (!refresh && state.__mbDomains && Date.now() - state.__mbDomains.at < CACHE_MS) return state.__mbDomains.list;
  const merged = new Map<string, MailDomain>();
  for (const d of fromEnv()) merged.set(d.name, d);
  try {
    for (const d of await discover()) merged.set(d.name, { name: d.name, zoneId: merged.get(d.name)?.zoneId ?? d.zoneId });
  } catch {
    // Pas de permission de lecture des zones : la liste de MAIL_DOMAINS suffit
  }
  const list = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  state.__mbDomains = { at: Date.now(), list };
  return list;
}

export async function findDomain(name: string | undefined | null): Promise<MailDomain | null> {
  if (!name) return null;
  return (await listDomains()).find((d) => d.name === name.toLowerCase()) ?? null;
}

/**
 * Domaine de travail : en-tête « X-Mail-Domain » (app mobile) ou cookie (web), validé contre la
 * liste des domaines et les droits de l'utilisateur connecté.
 */
export async function currentDomain(): Promise<MailDomain> {
  const [h, c] = await Promise.all([headers(), cookies()]);
  const domain = await findDomain(h.get("x-mail-domain") ?? c.get(DOMAIN_COOKIE)?.value);
  if (!domain) throw new HttpError(409, "Choisissez un domaine", "domain_required");
  if (!canAccessDomain(currentUser(), domain.name)) throw new HttpError(403, `Vous n'avez pas accès à ${domain.name}`, "domain_forbidden");
  return domain;
}

/** Domaines auxquels l'utilisateur connecté a accès */
export async function accessibleDomains(refresh = false): Promise<MailDomain[]> {
  const user = currentUser();
  return (await listDomains(refresh)).filter((d) => canAccessDomain(user, d.name));
}
