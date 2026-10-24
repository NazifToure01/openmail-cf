import "server-only";
import { messages } from "./store";

/**
 * Suivi de remise : l'API d'envoi répond « queued » immédiatement, la remise réelle arrive
 * quelques secondes plus tard. Le statut final se lit dans les journaux d'envoi Cloudflare
 * (GraphQL Analytics, jeu de données emailSendingAdaptive).
 *
 * Le token doit avoir la permission « Account Analytics : Read » : soit CLOUDFLARE_API_TOKEN,
 * soit un token dédié dans CLOUDFLARE_ANALYTICS_TOKEN.
 */

type SendingEvent = {
  datetime: string;
  messageId: string;
  envelopeTo: string;
  status: string;
  isLastEvent: number;
  errorCause: string;
  errorDetail: string;
};

const QUERY = `query($a: String!, $f: AccountEmailSendingAdaptiveFilter_InputObject!) {
  viewer { accounts(filter: { accountTag: $a }) {
    emailSendingAdaptive(limit: 1000, orderBy: [datetime_ASC], filter: $f) {
      datetime messageId envelopeTo status isLastEvent errorCause errorDetail
    }
  } }
}`;

// Au-delà, un destinataire toujours « en attente » n'est plus vérifié
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 20_000;

// Seuls des nombres et du texte sont partagés entre requêtes (pas de promesse : interdit sur Workers)
const state = globalThis as unknown as { __mbDeliveryAt?: number; __mbDeliveryError?: string | null };

export type DeliverySyncResult = { updated: number; error: string | null };

export async function refreshDeliveries(force = false): Promise<DeliverySyncResult> {
  if (!force && state.__mbDeliveryAt && Date.now() - state.__mbDeliveryAt < MIN_INTERVAL_MS) {
    return { updated: 0, error: state.__mbDeliveryError ?? null };
  }
  state.__mbDeliveryAt = Date.now();
  try {
    const updated = await run();
    state.__mbDeliveryError = null;
    return { updated, error: null };
  } catch (err) {
    state.__mbDeliveryError = (err as Error).message;
    return { updated: 0, error: (err as Error).message };
  }
}

const isFailure = (status: string) => /bounce|reject|fail|drop|suppress|block|invalid/i.test(status);

async function run(): Promise<number> {
  const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) return 0;

  const limit = Date.now() - MAX_AGE_MS;
  const docs = await messages.find(
    `sent_at > ? AND folder != 'drafts' AND coalesce(direction, 'out') != 'in'
     AND send_id IS NOT NULL AND json_array_length(data, '$.result.queued') > 0`,
    [new Date(limit).toISOString()],
  );
  const pending = docs.map((m) => ({ ...m, messageId: m.result!.message_id!, sentAt: m.sentAt ?? m.createdAt }));
  if (pending.length === 0) return 0;

  const since = new Date(Math.min(...pending.map((p) => Date.parse(p.sentAt))) - 60_000).toISOString();
  const res = await fetch(`${process.env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4"}/graphql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables: { a: accountId, f: { datetime_geq: since, messageId_in: pending.map((p) => p.messageId) } },
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as {
    data?: { viewer?: { accounts?: { emailSendingAdaptive?: SendingEvent[] }[] } } | null;
    errors?: { message: string; extensions?: { code?: string } }[] | null;
  } | null;
  if (json?.errors?.length) {
    const authz = json.errors.some((e) => e.extensions?.code === "authz" || /not authorized/i.test(e.message));
    throw new Error(
      authz
        ? "Le token Cloudflare n'a pas la permission « Account Analytics : Read » : le statut final des envois ne peut pas être vérifié."
        : json.errors.map((e) => e.message).join(" ; "),
    );
  }
  const events = json?.data?.viewer?.accounts?.[0]?.emailSendingAdaptive ?? [];
  if (!res.ok) throw new Error(`Suivi de remise : HTTP ${res.status}`);

  // Dernier événement connu par message et par destinataire
  const latest = new Map<string, SendingEvent>();
  for (const e of events) latest.set(`${e.messageId}|${e.envelopeTo.toLowerCase()}`, e);

  let updated = 0;
  for (const m of pending) {
    const result = m.result!;
    const delivery = { ...m.delivery };
    const stillQueued: string[] = [];
    for (const address of result.queued) {
      const e = latest.get(`${m.messageId}|${address.toLowerCase()}`);
      if (!e) {
        stillQueued.push(address);
        continue;
      }
      delivery[address] = { status: e.status, at: e.datetime, detail: e.errorDetail || e.errorCause || undefined };
      if (e.status === "delivered") result.delivered.push(address);
      else if (isFailure(e.status) && e.isLastEvent) result.permanent_bounces.push(address);
      else stillQueued.push(address);
    }
    if (stillQueued.length !== result.queued.length) {
      result.queued = stillQueued;
      await messages.update(m.id, { set: { result, delivery } });
      updated++;
    }
  }
  return updated;
}
