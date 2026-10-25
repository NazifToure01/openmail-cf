import "server-only";
import { DEFAULT_APP_NAME } from "./brand";
import type { RoutingStatus } from "./types";

export type { RoutingInfo, RoutingStatus } from "./types";

/**
 * Règles Cloudflare Email Routing : quand une adresse d'envoi est ajoutée dans l'app, une règle
 * « adresse → Worker de réception » est créée pour qu'elle reçoive aussi les e-mails.
 *
 * Token : permission « Zone → Email Routing Rules → Edit » sur le domaine, dans
 * CLOUDFLARE_ROUTING_TOKEN (ou CLOUDFLARE_API_TOKEN s'il a déjà cette permission).
 * L'id de zone du domaine vient de CLOUDFLARE_ZONE_ID (renseigné par `npm run deploy`).
 */

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchers: { type: string; field?: string; value?: string }[];
  actions: { type: string; value?: string[] }[];
};

const workerName = () => process.env.INBOX_WORKER_NAME || "openmail-cf-inbox";
const token = () => process.env.CLOUDFLARE_ROUTING_TOKEN || process.env.CLOUDFLARE_API_TOKEN;

export type Zone = { name: string; zoneId: string | null };

export function isRoutingConfigured(zone: Zone) {
  return Boolean(token() && zone.zoneId);
}

async function cf<T>(zone: Zone, path: string, init: RequestInit = {}): Promise<T> {
  const base = process.env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4";
  const res = await fetch(`${base}/zones/${zone.zoneId}/email/routing${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    result?: T;
    errors?: { code: number; message: string }[];
  } | null;
  if (!res.ok || !json?.success) {
    const msg = json?.errors?.map((e) => e.message).join(" ; ") || `HTTP ${res.status}`;
    if (res.status === 403 || /auth/i.test(msg)) {
      throw new Error(
        "Le token Cloudflare n'a pas la permission « Email Routing Rules : Edit » sur le domaine (CLOUDFLARE_ROUTING_TOKEN).",
      );
    }
    throw new Error(`Email Routing : ${msg}`);
  }
  return json.result as T;
}

const literalTo = (r: Rule) =>
  r.matchers.find((m) => m.type === "literal" && m.field === "to")?.value?.toLowerCase();
const sendsToWorker = (r: Rule) =>
  r.actions.some((a) => a.type === "worker" && a.value?.includes(workerName()));

async function listRules(zone: Zone): Promise<Rule[]> {
  return cf<Rule[]>(zone, "/rules?per_page=50");
}

async function catchAllToWorker(zone: Zone): Promise<boolean> {
  const rule = await cf<Rule>(zone, "/rules/catch_all");
  return rule.enabled && sendsToWorker(rule);
}

export async function routingStatuses(zone: Zone, addresses: string[]): Promise<Record<string, RoutingStatus>> {
  const [rules, catchAll] = await Promise.all([listRules(zone), catchAllToWorker(zone)]);
  const out: Record<string, RoutingStatus> = {};
  for (const address of addresses) {
    const rule = rules.find((r) => literalTo(r) === address.toLowerCase());
    out[address] =
      rule && rule.enabled && sendsToWorker(rule) ? "worker" : catchAll ? "catchall" : rule ? "other" : "none";
  }
  return out;
}

const body = (address: string) =>
  JSON.stringify({
    name: `${DEFAULT_APP_NAME} — ${address}`,
    enabled: true,
    matchers: [{ type: "literal", field: "to", value: address }],
    actions: [{ type: "worker", value: [workerName()] }],
  });

/** Crée (ou corrige) la règle qui envoie cette adresse vers la boîte de réception de l'app */
export async function ensureRoutingRule(zone: Zone, address: string): Promise<"created" | "updated" | "unchanged"> {
  const rule = (await listRules(zone)).find((r) => literalTo(r) === address.toLowerCase());
  if (!rule) {
    await cf(zone, "/rules", { method: "POST", body: body(address) });
    return "created";
  }
  if (rule.enabled && sendsToWorker(rule)) return "unchanged";
  // Une règle existante qui transfère ailleurs est redirigée vers la boîte de l'app
  await cf(zone, `/rules/${rule.id}`, { method: "PUT", body: body(address) });
  return "updated";
}

/** Supprime la règle de cette adresse, seulement si elle pointe vers le Worker de l'app */
export async function removeRoutingRule(zone: Zone, address: string): Promise<boolean> {
  const rule = (await listRules(zone)).find((r) => literalTo(r) === address.toLowerCase());
  if (!rule || !sendsToWorker(rule)) return false;
  await cf(zone, `/rules/${rule.id}`, { method: "DELETE" });
  return true;
}
