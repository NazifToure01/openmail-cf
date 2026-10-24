import { cookies } from "next/headers";
import { DOMAIN_COOKIE, accessibleDomains } from "@/lib/domains";
import { HttpError, handler, readJson } from "@/lib/server";

/** Domaines disponibles + domaine choisi */
export const GET = handler(async (req: Request) => {
  const store = await cookies();
  // ?refresh : interroge Cloudflare sans attendre l'expiration du cache
  const domains = await accessibleDomains(new URL(req.url).searchParams.has("refresh"));
  const saved = store.get(DOMAIN_COOKIE)?.value;
  const current = domains.find((d) => d.name === saved)?.name ?? null;
  return Response.json({ domains: domains.map((d) => ({ name: d.name, reception: Boolean(d.zoneId) })), current });
});

/** Choisit le domaine de travail : { domain } */
export const POST = handler(async (req: Request) => {
  const { domain } = await readJson<{ domain?: string }>(req);
  const found = (await accessibleDomains()).find((d) => d.name === String(domain ?? "").toLowerCase());
  if (!found) throw new HttpError(400, "Domaine inconnu ou non autorisé");
  const store = await cookies();
  store.set(DOMAIN_COOKIE, found.name, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return Response.json({ domain: found.name });
});
