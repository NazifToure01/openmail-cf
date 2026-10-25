import { aiClientStatus, aiProvider, getAiSettings, usageToday } from "@/lib/ai";
import { indexStats } from "@/lib/ai-mail";
import { HttpError, handler, readJson } from "@/lib/server";
import { requireAdmin } from "@/lib/session";
import { aiSettings, type AiSetting } from "@/lib/store";

/** Réglages IA (administrateur) : fournisseur configuré, fonctionnalités, quotas, résumé quotidien */
export const GET = handler(async () => {
  requireAdmin();
  const provider = aiProvider();
  const [settings, status, usage, index] = await Promise.all([
    getAiSettings(),
    aiClientStatus(),
    usageToday(),
    provider?.embeddingModel ? indexStats() : null,
  ]);
  return Response.json({
    provider: provider
      ? {
          name: provider.label,
          kind: provider.kind,
          host: provider.kind === "openai" ? new URL(provider.baseUrl).host : null,
          model: provider.model,
          embeddingModel: provider.embeddingModel,
        }
      : null,
    settings: { features: settings.features, dailyLimit: settings.dailyLimit, digest: settings.digest },
    status,
    usage,
    index,
  });
});

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const PUT = handler(async (request: Request) => {
  requireAdmin();
  const body = await readJson<{ features?: Partial<AiSetting["features"]>; dailyLimit?: number; digest?: Partial<AiSetting["digest"]> }>(request);
  const current = await getAiSettings();
  const features = { ...current.features };
  for (const key of Object.keys(features) as (keyof AiSetting["features"])[]) {
    if (typeof body.features?.[key] === "boolean") features[key] = body.features[key]!;
  }
  let dailyLimit = current.dailyLimit;
  if (body.dailyLimit !== undefined) {
    dailyLimit = Math.round(Number(body.dailyLimit));
    if (!Number.isFinite(dailyLimit) || dailyLimit < 1 || dailyLimit > 100_000) throw new HttpError(400, "Limite quotidienne invalide (1 à 100 000)");
  }
  const digest = { ...current.digest };
  if (typeof body.digest?.enabled === "boolean") digest.enabled = body.digest.enabled;
  if (body.digest?.hour !== undefined) {
    const hour = Number(body.digest.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new HttpError(400, "Heure du résumé invalide (0 à 23)");
    digest.hour = hour;
  }
  if (body.digest?.timeZone !== undefined) {
    const tz = String(body.digest.timeZone).trim();
    if (!isTimeZone(tz)) throw new HttpError(400, "Fuseau horaire inconnu (ex. Europe/Paris)");
    digest.timeZone = tz;
  }
  const doc: AiSetting = { id: "ai", features, dailyLimit, digest, updatedAt: new Date().toISOString() };
  await aiSettings.put(doc);
  return Response.json({ settings: { features, dailyLimit, digest } });
});
