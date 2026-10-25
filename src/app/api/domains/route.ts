import { listDomains } from "@/lib/domains";
import { handler } from "@/lib/server";

/** Domaine de l'instance (liste d'un élément, utilisée pour les droits des utilisateurs) */
export const GET = handler(async () => {
  const domains = await listDomains();
  return Response.json({ domains: domains.map((d) => ({ name: d.name, reception: Boolean(d.zoneId) })) });
});
