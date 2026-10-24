import { HttpError, handler, readJson } from "@/lib/server";
import { currentUser } from "@/lib/session";
import { pushTokens } from "@/lib/store";

const EXPO_TOKEN = /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/;

/** Statut des appareils enregistrés pour l'utilisateur connecté */
export const GET = handler(async () => {
  const list = await pushTokens.find("user_id = ?", [currentUser().id]);
  return Response.json({
    count: list.length,
    devices: list.map((d) => ({ platform: d.platform, updatedAt: d.updatedAt })),
  });
});

/** Enregistre l'appareil pour les notifications : { token, platform } */
export const POST = handler(async (request: Request) => {
  const { token, platform } = await readJson<{ token?: string; platform?: string }>(request);
  if (!token || !EXPO_TOKEN.test(token)) throw new HttpError(400, "Jeton de notification invalide");
  await pushTokens.put({
    token,
    userId: currentUser().id,
    platform: String(platform ?? "unknown").slice(0, 20),
    updatedAt: new Date().toISOString(),
  });
  return Response.json({ ok: true });
});

/** Désactive les notifications de cet appareil : { token, all } */
export const DELETE = handler(async (request: Request) => {
  const body = (await readJson<{ token?: string; all?: boolean }>(request).catch(() => ({}))) as { token?: string; all?: boolean };
  if (body.token && !body.all) {
    await pushTokens.removeWhere("id = ? AND user_id = ?", [body.token, currentUser().id]);
  } else {
    // Tous les appareils (aussi par sécurité si aucun token n'est spécifié)
    await pushTokens.removeWhere("user_id = ?", [currentUser().id]);
  }
  return Response.json({ ok: true });
});


