/**
 * Boîte de réception OpenMail CF — Email Worker
 *
 * - email()  : chaque e-mail reçu par Email Routing est stocké tel quel (MIME brut) dans KV,
 *              et éventuellement transféré vers FORWARD_TO.
 * - fetch()  : petite API protégée par INBOX_SECRET que l'application interroge pour
 *              récupérer puis supprimer les messages en attente.
 *     GET    /messages        -> { messages: [{ key, from, to, size, receivedAt }] }
 *     GET    /messages/:key   -> MIME brut (message/rfc822)
 *     DELETE /messages/:key   -> { ok: true }
 *
 * Images des e-mails (insérées depuis l'éditeur) :
 *     PUT    /images/:id      -> stocke l'image (protégé par INBOX_SECRET)
 *     GET    /images/:id      -> public : c'est l'adresse lue par les clients mail des destinataires
 *     DELETE /images/:id      -> supprime l'image (protégé)
 */

interface Env {
  INBOX: KVNamespace;
  INBOX_SECRET: string;
  FORWARD_TO?: string;
  /** Adresse de l'app à prévenir à chaque e-mail reçu (import immédiat + notifications push) */
  APP_HOOK_URL?: string;
}

type Meta = { from: string; to: string; size: number; receivedAt: string };

const PREFIX = "msg:";
const IMAGE_PREFIX = "img:";
const MAX_IMAGE = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif"];
// KV accepte jusqu'à 25 Mio par valeur, la limite d'Email Routing
const MAX_SIZE = 25 * 1024 * 1024;
// Conservé 30 jours si l'application ne le récupère pas
const TTL_SECONDS = 30 * 24 * 60 * 60;

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    if (message.rawSize > MAX_SIZE) {
      message.setReject("Message trop volumineux");
      return;
    }

    const raw = await new Response(message.raw).arrayBuffer();
    const receivedAt = new Date().toISOString();
    // Clé triable chronologiquement
    const key = `${PREFIX}${Date.now().toString().padStart(15, "0")}-${crypto.randomUUID()}`;
    const metadata: Meta = { from: message.from, to: message.to, size: raw.byteLength, receivedAt };

    await env.INBOX.put(key, raw, { metadata, expirationTtl: TTL_SECONDS });

    console.log("Reçu", { from: message.from, to: message.to, size: raw.byteLength, key });

    // Prévient l'app : elle importe le message et envoie les notifications (sinon, import au prochain passage)
    if (env.APP_HOOK_URL) {
      ctx.waitUntil(
        fetch(env.APP_HOOK_URL, { method: "POST", headers: { Authorization: `Bearer ${env.INBOX_SECRET}` } })
          .then((r) => console.log("App prévenue", r.status))
          .catch((err) => console.error("App injoignable", String(err))),
      );
    }

    if (env.FORWARD_TO) {
      // Le transfert doit se faire pendant le traitement (pas en arrière-plan) pour être pris en compte.
      // Une erreur de transfert ne doit pas faire perdre le message déjà stocké.
      try {
        await message.forward(env.FORWARD_TO);
        console.log("Transféré vers", env.FORWARD_TO);
      } catch (err) {
        console.error("Transfert impossible vers", env.FORWARD_TO, String(err));
      }
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Lecture publique des images : les destinataires doivent pouvoir les afficher
    const image = url.pathname.match(/^\/images\/([a-f0-9-]{36}\.(?:png|jpg|gif))$/);
    if (image && (request.method === "GET" || request.method === "HEAD")) {
      const { value, metadata } = await env.INBOX.getWithMetadata<{ type: string }>(IMAGE_PREFIX + image[1], "arrayBuffer");
      if (!value) return new Response("Introuvable", { status: 404 });
      return new Response(request.method === "HEAD" ? null : value, {
        headers: {
          "Content-Type": metadata?.type ?? "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (!env.INBOX_SECRET || !(await isAuthorized(request, env.INBOX_SECRET))) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    if (image && request.method === "PUT") {
      const type = request.headers.get("Content-Type") ?? "";
      if (!IMAGE_TYPES.includes(type)) return Response.json({ error: "Type d'image non accepté" }, { status: 415 });
      const data = await request.arrayBuffer();
      if (data.byteLength === 0 || data.byteLength > MAX_IMAGE) {
        return Response.json({ error: "Image vide ou trop volumineuse (5 Mo max)" }, { status: 413 });
      }
      await env.INBOX.put(IMAGE_PREFIX + image[1], data, { metadata: { type } });
      return Response.json({ ok: true, path: `/images/${image[1]}` });
    }
    if (image && request.method === "DELETE") {
      await env.INBOX.delete(IMAGE_PREFIX + image[1]);
      return Response.json({ ok: true });
    }

    const match = url.pathname.match(/^\/messages(?:\/([^/]+))?\/?$/);
    if (!match) return Response.json({ error: "Introuvable" }, { status: 404 });
    const key = match[1] ? decodeURIComponent(match[1]) : null;
    if (key && !key.startsWith(PREFIX)) return Response.json({ error: "Clé invalide" }, { status: 400 });

    if (!key && request.method === "GET") {
      const list = await env.INBOX.list<Meta>({ prefix: PREFIX, limit: 100 });
      return Response.json({
        messages: list.keys.map((k) => ({ key: k.name, ...(k.metadata ?? {}) })),
        more: !list.list_complete,
      });
    }
    if (key && request.method === "GET") {
      const raw = await env.INBOX.get(key, "arrayBuffer");
      if (!raw) return Response.json({ error: "Introuvable" }, { status: 404 });
      return new Response(raw, { headers: { "Content-Type": "message/rfc822" } });
    }
    if (key && request.method === "DELETE") {
      await env.INBOX.delete(key);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Méthode non autorisée" }, { status: 405 });
  },
} satisfies ExportedHandler<Env>;

/** Comparaison en temps constant du jeton Bearer */
async function isAuthorized(request: Request, secret: string): Promise<boolean> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(token)),
    crypto.subtle.digest("SHA-256", enc.encode(secret)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}
