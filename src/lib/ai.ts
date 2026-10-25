import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { HttpError } from "./errors";
import { aiSettings, aiUsage, type AiSetting } from "./store";

/**
 * Fournisseur d'IA, désactivé tant que AI_PROVIDER n'est pas défini :
 *
 *  - workers-ai : modèles hébergés par Cloudflare (binding « AI »), sans clé ; les données restent chez Cloudflare.
 *  - openai, mistral : presets de l'API compatible OpenAI (AI_API_KEY obligatoire).
 *  - openai-compatible : n'importe quel service compatible (OpenRouter, Groq, Ollama, AI Gateway…),
 *    avec AI_BASE_URL et AI_MODEL.
 *
 * AI_MODEL et AI_EMBEDDING_MODEL remplacent les modèles par défaut. Sans modèle d'embeddings,
 * la recherche par le sens est désactivée.
 */

export type AiProvider =
  | { kind: "workers-ai"; label: string; model: string; embeddingModel: string | null; gateway: string | null }
  | { kind: "openai"; label: string; baseUrl: string; apiKey: string; model: string; embeddingModel: string | null };

const PRESETS: Record<string, { label: string; baseUrl: string; model: string; embeddingModel: string }> = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", embeddingModel: "text-embedding-3-small" },
  mistral: { label: "Mistral AI", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest", embeddingModel: "mistral-embed" },
};

const env = (key: string) => process.env[key]?.trim() || "";

export function aiProvider(): AiProvider | null {
  const kind = env("AI_PROVIDER").toLowerCase();
  if (!kind || kind === "none" || kind === "off") return null;
  if (kind === "workers-ai" || kind === "cloudflare") {
    return {
      kind: "workers-ai",
      label: "Cloudflare Workers AI",
      model: env("AI_MODEL") || "@cf/google/gemma-4-26b-a4b-it",
      embeddingModel: env("AI_EMBEDDING_MODEL") || "@cf/baai/bge-m3",
      gateway: env("AI_GATEWAY_ID") || null,
    };
  }
  const preset = PRESETS[kind];
  const baseUrl = (env("AI_BASE_URL") || preset?.baseUrl || "").replace(/\/+$/, "");
  const model = env("AI_MODEL") || preset?.model || "";
  const apiKey = env("AI_API_KEY");
  if (!baseUrl || !model || (!apiKey && preset)) {
    console.error(`IA désactivée : AI_PROVIDER=${kind} demande ${preset ? "AI_API_KEY" : "AI_BASE_URL, AI_MODEL (et AI_API_KEY si besoin)"}`);
    return null;
  }
  return {
    kind: "openai",
    label: preset?.label ?? "API compatible OpenAI",
    baseUrl,
    apiKey,
    model,
    embeddingModel: env("AI_EMBEDDING_MODEL") || preset?.embeddingModel || null,
  };
}

export const isAiEnabled = () => aiProvider() !== null;

/* ---------- Réglages (Réglages → IA) ---------- */

export type AiFeature = keyof AiSetting["features"];

export const DEFAULT_AI_SETTINGS: Omit<AiSetting, "updatedAt"> = {
  id: "ai",
  features: { compose: true, summary: true, triage: true, search: true },
  dailyLimit: 200,
  digest: { enabled: false, hour: 7, timeZone: "Europe/Paris" },
};

export async function getAiSettings(): Promise<AiSetting> {
  const doc = await aiSettings.get("ai").catch(() => null);
  return {
    ...DEFAULT_AI_SETTINGS,
    updatedAt: "",
    ...doc,
    features: { ...DEFAULT_AI_SETTINGS.features, ...doc?.features },
    digest: { ...DEFAULT_AI_SETTINGS.digest, ...doc?.digest },
  };
}

/** Fonctionnalité utilisable : fournisseur configuré + activée par l'administrateur (+ embeddings pour la recherche) */
export async function featureEnabled(feature: AiFeature | "digest"): Promise<boolean> {
  const provider = aiProvider();
  if (!provider) return false;
  const s = await getAiSettings();
  if (feature === "digest") return s.digest.enabled;
  if (feature === "search" && !provider.embeddingModel) return false;
  return s.features[feature];
}

export async function requireFeature(feature: AiFeature) {
  if (!aiProvider()) throw new HttpError(503, "L'IA n'est pas configurée sur ce serveur (AI_PROVIDER)", "ai_disabled");
  if (!(await featureEnabled(feature))) throw new HttpError(403, "Cette fonctionnalité IA est désactivée par l'administrateur", "ai_feature_disabled");
}

/** État exposé à l'interface (aucune clé ni URL interne) */
export async function aiClientStatus() {
  const provider = aiProvider();
  if (!provider) return { enabled: false as const };
  const s = await getAiSettings();
  return {
    enabled: true as const,
    provider: provider.label,
    model: provider.model,
    features: { ...s.features, search: s.features.search && Boolean(provider.embeddingModel) },
  };
}

/* ---------- Quotas ---------- */

/** Jour courant (UTC) pour les compteurs */
export const today = () => new Date().toISOString().slice(0, 10);

/** Plafond des traitements automatiques (tri, indexation, résumés quotidiens) par jour */
const autoLimit = () => Number(env("AI_AUTO_DAILY_LIMIT")) || 2000;

/**
 * Compte un appel. `who` = id de l'utilisateur (limite des réglages) ou "auto" (traitements
 * automatiques). Lève une erreur 429 si la limite du jour est atteinte.
 */
export async function consume(who: string, n = 1) {
  const day = today();
  const id = `${who}:${day}`;
  const limit = who === "auto" ? autoLimit() : (await getAiSettings()).dailyLimit;
  const current = (await aiUsage.get(id))?.count ?? 0;
  if (current + n > limit) {
    throw new HttpError(429, who === "auto" ? "Limite quotidienne des traitements IA automatiques atteinte" : `Limite de ${limit} requêtes IA par jour atteinte, réessayez demain`, "ai_quota");
  }
  const updated = await aiUsage.update(id, { inc: { count: n } });
  if (!updated) await aiUsage.put({ id, day, count: current + n });
}

export async function usageToday(): Promise<{ total: number; auto: number }> {
  const rows = await aiUsage.find("id LIKE ?", [`%:${today()}`]);
  return {
    total: rows.reduce((s, r) => s + r.count, 0),
    auto: rows.find((r) => r.id.startsWith("auto:"))?.count ?? 0,
  };
}

/* ---------- Appels ---------- */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type WorkersAi = { run(model: string, input: unknown, options?: unknown): Promise<unknown> };

async function workersAi(): Promise<WorkersAi> {
  const { env: bindings } = await getCloudflareContext({ async: true });
  const ai = (bindings as unknown as { AI?: WorkersAi }).AI;
  if (!ai) throw new HttpError(503, "Le binding Workers AI (« AI ») n'est pas configuré : relancez npm run deploy");
  return ai;
}

class ProviderError extends HttpError {
  constructor(detail: string) {
    super(502, `Le service d'IA n'a pas répondu correctement : ${detail}`, "ai_provider");
  }
}

async function openAiFetch<T>(provider: Extract<AiProvider, { kind: "openai" }>, path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${provider.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new ProviderError((err as Error).name === "TimeoutError" ? "délai dépassé" : "service injoignable");
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string } | string }) | null;
  if (!res.ok || !json) {
    const message = typeof json?.error === "string" ? json.error : json?.error?.message;
    if (res.status === 429) throw new HttpError(429, "Le service d'IA limite le nombre de requêtes, réessayez dans un instant", "ai_rate");
    throw new ProviderError(`HTTP ${res.status}${message ? ` (${message.slice(0, 200)})` : ""}`);
  }
  return json;
}

/** Texte d'une réponse Workers AI (ancien format { response } ou format OpenAI { choices }) */
function workersAiText(result: unknown): string {
  const r = result as { response?: unknown; choices?: { message?: { content?: string } }[] };
  if (typeof r?.response === "string") return r.response;
  if (r?.response && typeof r.response === "object") return JSON.stringify(r.response);
  return r?.choices?.[0]?.message?.content ?? "";
}

export async function chat(messages: ChatMessage[], { json = false, maxTokens = 800, temperature = 0.3 } = {}): Promise<string> {
  const provider = aiProvider();
  if (!provider) throw new HttpError(503, "L'IA n'est pas configurée sur ce serveur (AI_PROVIDER)", "ai_disabled");
  let text: string;
  if (provider.kind === "workers-ai") {
    const ai = await workersAi();
    const result = await ai
      .run(
        provider.model,
        {
          messages,
          max_tokens: maxTokens,
          temperature,
          ...(json ? { response_format: { type: "json_object" } } : {}),
          // Modèles « à raisonnement » : réponse directe, plus rapide
          ...(/gemma-4|qwen3/i.test(provider.model) ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        },
        provider.gateway ? { gateway: { id: provider.gateway } } : undefined,
      )
      .catch((err: Error) => {
        throw new ProviderError(err.message.slice(0, 200));
      });
    text = workersAiText(result);
  } else {
    const result = await openAiFetch<{ choices?: { message?: { content?: string } }[] }>(provider, "/chat/completions", {
      model: provider.model,
      messages,
      max_tokens: maxTokens,
      temperature,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    });
    text = result.choices?.[0]?.message?.content ?? "";
  }
  text = text.trim();
  if (!text) throw new ProviderError("réponse vide");
  return text;
}

/** Réponse JSON : tolère les blocs ```json et le texte autour de l'objet */
export async function chatJson<T>(messages: ChatMessage[], options: { maxTokens?: number } = {}): Promise<T> {
  const text = await chat(messages, { ...options, json: true, temperature: 0.1 });
  return parseJsonObject<T>(text);
}

export function parseJsonObject<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  try {
    return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned) as T;
  } catch {
    throw new ProviderError("réponse JSON illisible");
  }
}

export function embeddingModel(): string | null {
  return aiProvider()?.embeddingModel ?? null;
}

/** Vecteurs des textes (même ordre) */
export async function embed(texts: string[]): Promise<number[][]> {
  const provider = aiProvider();
  if (!provider?.embeddingModel) throw new HttpError(503, "Aucun modèle d'embeddings configuré (AI_EMBEDDING_MODEL)", "ai_disabled");
  if (!texts.length) return [];
  let vectors: number[][] | undefined;
  if (provider.kind === "workers-ai") {
    const ai = await workersAi();
    const result = (await ai
      .run(provider.embeddingModel, { text: texts }, provider.gateway ? { gateway: { id: provider.gateway } } : undefined)
      .catch((err: Error) => {
        throw new ProviderError(err.message.slice(0, 200));
      })) as { data?: number[][] };
    vectors = result.data;
  } else {
    const result = await openAiFetch<{ data?: { embedding: number[]; index?: number }[] }>(provider, "/embeddings", {
      model: provider.embeddingModel,
      input: texts,
    });
    vectors = result.data?.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => d.embedding);
  }
  if (!vectors || vectors.length !== texts.length) throw new ProviderError("vecteurs manquants");
  return vectors;
}
