import { currentDomain } from "@/lib/domains";
import { ensureRoutingRule, isRoutingConfigured } from "@/lib/routing";
import { requireAdmin } from "@/lib/session";
import { HttpError, handler } from "@/lib/server";
import { identities } from "@/lib/store";

/** Active la réception d'une adresse existante (crée ou corrige sa règle Email Routing) */
export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  requireAdmin();
  const { id } = await params;
  const domain = await currentDomain();
  if (!isRoutingConfigured(domain)) {
    throw new HttpError(400, `Réception automatique non configurée pour ${domain.name} (token ou id de zone manquant)`);
  }
  const identity = await identities.get(id);
  if (!identity) throw new HttpError(404, "Adresse introuvable");
  try {
    return Response.json({ result: await ensureRoutingRule(domain, identity.address) });
  } catch (err) {
    throw new HttpError(502, (err as Error).message);
  }
});
