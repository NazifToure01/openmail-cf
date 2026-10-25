import { createServer } from "node:http";

/**
 * Serveur factice pour les tests : remplace le fournisseur d'IA (API compatible OpenAI),
 * l'API Cloudflare (envoi d'e-mails) et le Worker de réception.
 *
 *   /v1/chat/completions, /v1/embeddings   IA (réponses déterministes selon la tâche)
 *   /client/v4/accounts/:id/email/sending/send   envoi d'e-mails
 *   /inbox/messages[/:key]                 Worker de réception (file d'attente en mémoire)
 *   POST /__inbox   { from, to, subject, text }   ajoute un e-mail reçu
 *   GET  /__log                            requêtes reçues (IA et envois)
 */

const log = [];
const inbox = new Map();
let seq = 0;

const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Vecteur « sac de mots » : deux textes qui partagent des mots sont proches */
export function fakeEmbedding(text, dim = 64) {
  const v = new Array(dim).fill(0);
  for (const raw of normalize(text).match(/[a-z0-9]{3,}/g) ?? []) {
    const word = raw.replace(/s$/, "");
    let h = 2166136261;
    for (const c of word) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    v[Math.abs(h) % dim] += 1;
  }
  return v;
}

function chatReply(messages) {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const task = system.match(/\[tâche: ([^\]]+)\]/)?.[1] ?? "";
  const text = normalize(user);
  const subject = user.match(/Objet : (.*)/)?.[1] ?? "";
  switch (task) {
    case "triage":
      return JSON.stringify({
        category: text.includes("facture") ? "facture" : text.includes("desinscri") ? "newsletter" : text.includes("rendez-vous") ? "rendez-vous" : "autre",
        priority: text.includes("urgent") ? "high" : "normal",
        needsReply: user.includes("?"),
        gist: `En bref : ${subject}`,
        phishing: text.includes("mot de passe") ? { risk: "high", reasons: ["Demande d'identifiants"] } : { risk: "low", reasons: [] },
        events: text.includes("rendez-vous") ? [{ title: "Rendez-vous", start: "2026-11-03T14:00", location: "Paris" }] : [],
      });
    case "résumé":
      return `- Point clé : ${subject}\n- À faire : répondre`;
    case "réponses":
      return "```json\n" + JSON.stringify({ replies: ["Merci, c'est noté.", "Pouvez-vous préciser ?", "Je reviens vers vous la semaine prochaine."] }) + "\n```";
    case "rédaction":
      return `Texte IA : ${user.split("\n")[0]}\n\nDeuxième paragraphe <b>sans HTML</b>.`;
    case "question":
      return "D'après [1], la facture s'élève à 120 €.";
    case "résumé quotidien":
      return "Deux e-mails importants aujourd'hui.";
    default:
      return "?";
  }
}

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

export function startMockServer(port = 0) {
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const body = raw.length && req.headers["content-type"]?.includes("json") ? JSON.parse(raw.toString()) : null;
    const url = new URL(req.url, "http://mock");
    const path = url.pathname;

    if (path === "/__log") return json(res, 200, log);
    if (path === "/__inbox" && req.method === "POST") {
      const key = `msg:${String(Date.now()).padStart(15, "0")}-${++seq}`;
      const mime =
        `From: ${body.fromName ?? "Expéditeur"} <${body.from}>\r\nTo: ${body.to}\r\nSubject: ${body.subject}\r\n` +
        `Message-ID: <${key}@mock>\r\nDate: ${new Date().toUTCString()}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body.text}\r\n`;
      inbox.set(key, { mime, from: body.from, to: body.to, receivedAt: new Date().toISOString() });
      return json(res, 200, { key });
    }

    // Worker de réception
    if (path.startsWith("/inbox/messages")) {
      if (req.headers.authorization !== `Bearer ${process.env.MOCK_INBOX_SECRET}`) return json(res, 401, { error: "Non autorisé" });
      const key = decodeURIComponent(path.slice("/inbox/messages/".length));
      if (path === "/inbox/messages") {
        return json(res, 200, {
          messages: [...inbox].map(([k, v]) => ({ key: k, from: v.from, to: v.to, size: v.mime.length, receivedAt: v.receivedAt })),
          more: false,
        });
      }
      if (req.method === "GET") {
        const item = inbox.get(key);
        if (!item) return json(res, 404, { error: "Introuvable" });
        res.writeHead(200, { "Content-Type": "message/rfc822" });
        return res.end(item.mime);
      }
      if (req.method === "DELETE") {
        inbox.delete(key);
        return json(res, 200, { ok: true });
      }
    }

    // IA compatible OpenAI
    if (path === "/v1/chat/completions") {
      log.push({ type: "chat", auth: req.headers.authorization, body });
      if (body.messages.some((m) => m.content.includes("FORCE_AI_ERROR"))) return json(res, 500, { error: { message: "panne simulée" } });
      return json(res, 200, { choices: [{ message: { role: "assistant", content: chatReply(body.messages) } }] });
    }
    if (path === "/v1/embeddings") {
      log.push({ type: "embeddings", auth: req.headers.authorization, body });
      return json(res, 200, { data: body.input.map((t, index) => ({ index, embedding: fakeEmbedding(t) })) });
    }

    // API Cloudflare : envoi
    if (/^\/client\/v4\/accounts\/[^/]+\/email\/sending\/send$/.test(path)) {
      log.push({ type: "send", body });
      const to = body.to.map((a) => (typeof a === "string" ? a : a.address));
      return json(res, 200, { success: true, result: { delivered: to, queued: [], permanent_bounces: [], message_id: `<sent-${++seq}@mock>` } });
    }

    json(res, 404, { error: `Mock : ${req.method} ${path}` });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
