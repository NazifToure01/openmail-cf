import { currentDomain } from "@/lib/domains";
import { ensureRoutingRule, isRoutingConfigured, routingStatuses, type RoutingInfo } from "@/lib/routing";
import { HttpError, handler, readJson } from "@/lib/server";
import { canUseAddress, currentUser, requireAdmin } from "@/lib/session";
import { DuplicateError } from "@/lib/db";
import { identities as identitiesTable } from "@/lib/store";
import { cleanIdentity } from "@/lib/validators";
import type { Identity } from "@/lib/types";

/** Adresses d'envoi du domaine choisi, avec l'état de leur réception */
export const GET = handler(async () => {
  const domain = await currentDomain();
  const user = currentUser();
  const identities = (await identitiesTable.find("domain = ?", [domain.name])).filter((i) =>
    canUseAddress(user, domain.name, i.address),
  );
  const routing: RoutingInfo = { configured: isRoutingConfigured(domain), statuses: {}, error: null };
  if (routing.configured && identities.length) {
    try {
      routing.statuses = await routingStatuses(domain, identities.map((i) => i.address));
    } catch (err) {
      routing.error = (err as Error).message;
    }
  }
  return Response.json({ identities, routing });
});

export const POST = handler(async (req: Request) => {
  requireAdmin();
  const domain = await currentDomain();
  const data = cleanIdentity(await readJson<Partial<Identity>>(req), domain.name);
  if (await identitiesTable.first("address = ?", [data.address])) throw new HttpError(409, "Cette adresse existe déjà");
  const sameDomain = await identitiesTable.count("domain = ?", [domain.name]);
  const identity: Identity = { id: crypto.randomUUID(), ...data, isDefault: data.isDefault || sameDomain === 0 };
  // « Par défaut » s'entend par domaine
  if (identity.isDefault) await identitiesTable.updateWhere("domain = ?", [domain.name], { set: { isDefault: false } });
  try {
    await identitiesTable.insert(identity);
  } catch (err) {
    if (err instanceof DuplicateError) throw new HttpError(409, "Cette adresse existe déjà");
    throw err;
  }

  // Réception : règle Email Routing adresse → Worker de l'app, sur la zone du domaine
  let routing: { result?: string; error?: string } | null = null;
  if (isRoutingConfigured(domain)) {
    try {
      routing = { result: await ensureRoutingRule(domain, identity.address) };
    } catch (err) {
      routing = { error: (err as Error).message };
    }
  }
  return Response.json({ identity, routing });
});
