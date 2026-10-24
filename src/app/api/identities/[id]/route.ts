import { currentDomain } from "@/lib/domains";
import { ensureRoutingRule, isRoutingConfigured, removeRoutingRule } from "@/lib/routing";
import { requireAdmin } from "@/lib/session";
import { HttpError, handler, readJson } from "@/lib/server";
import { identities } from "@/lib/store";
import type { Identity } from "@/lib/types";
import { cleanIdentity } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  requireAdmin();
  const { id } = await params;
  const domain = await currentDomain();
  const data = cleanIdentity(await readJson<Partial<Identity>>(req), domain.name);
  const current = await identities.get(id);
  if (!current) throw new HttpError(404, "Adresse introuvable");
  const previous = current.address;
  if (await identities.first("id != ? AND address = ?", [id, data.address])) throw new HttpError(409, "Cette adresse existe déjà");
  const sameDomain = await identities.count("domain = ?", [domain.name]);
  if (data.isDefault) await identities.updateWhere("domain = ?", [domain.name], { set: { isDefault: false } });
  const identity: Identity = { ...current, ...data, isDefault: data.isDefault || (current.isDefault && sameDomain === 1) };
  await identities.put(identity);

  // Adresse modifiée : la règle de réception suit
  let routing: { result?: string; error?: string } | null = null;
  if (previous && previous !== identity.address && isRoutingConfigured(domain)) {
    try {
      await removeRoutingRule(domain, previous);
      routing = { result: await ensureRoutingRule(domain, identity.address) };
    } catch (err) {
      routing = { error: (err as Error).message };
    }
  }
  return Response.json({ identity, routing });
});

/** Retire l'adresse de l'app et sa règle de réception (si elle pointe vers la boîte de l'app) */
export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  requireAdmin();
  const { id } = await params;
  const domain = await currentDomain();
  const removed = await identities.remove(id);
  if (removed?.isDefault) {
    // Une autre adresse du domaine devient l'adresse par défaut
    const next = await identities.first("domain = ?", [domain.name]);
    if (next) await identities.update(next.id, { set: { isDefault: true } });
  }
  let routing: { result?: string; error?: string } | null = null;
  if (removed && removed.address.endsWith(`@${domain.name}`) && isRoutingConfigured(domain)) {
    try {
      routing = { result: (await removeRoutingRule(domain, removed.address)) ? "removed" : "none" };
    } catch (err) {
      routing = { error: (err as Error).message };
    }
  }
  return Response.json({ ok: true, routing });
});
