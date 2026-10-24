import { API_URL } from "./config";

/**
 * Client de l'API : ajoute le jeton de session et le domaine de travail à chaque requête.
 * Les gestionnaires (déconnexion, choix du domaine) sont branchés par la session.
 */

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public data?: unknown) {
    super(message);
  }
}

type Context = {
  token: string | null;
  domain: string | null;
  onUnauthorized: () => void;
  onDomainRequired: () => void;
};

const ctx: Context = { token: null, domain: null, onUnauthorized: () => {}, onDomainRequired: () => {} };

export function configureApi(patch: Partial<Context>) {
  Object.assign(ctx, patch);
}

export type FilePart = { uri: string; name: string; type: string };

export async function api<T>(
  path: string,
  init: { method?: string; json?: unknown; form?: Record<string, string | FilePart>; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;
  if (ctx.domain) headers["X-Mail-Domain"] = ctx.domain;

  let body: BodyInit | undefined;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) {
    const form = new FormData();
    // React Native accepte { uri, name, type } comme fichier
    for (const [k, v] of Object.entries(init.form)) form.append(k, v as unknown as Blob);
    body = form;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: init.method ?? (body ? "POST" : "GET"), headers, body, signal: init.signal });
  } catch {
    throw new ApiError(0, "Impossible de joindre le serveur. Vérifiez votre connexion.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (res.status === 401 && !path.startsWith("/api/auth/login")) {
    ctx.onUnauthorized();
    throw new ApiError(401, data.error || "Session expirée");
  }
  if (res.status === 409 && data.code === "domain_required") {
    ctx.onDomainRequired();
    throw new ApiError(409, data.error || "Choisissez un domaine", data.code);
  }
  if (!res.ok) throw new ApiError(res.status, data.error || `Erreur ${res.status}`, data.code, data);
  return data as T;
}

/** En-têtes d'authentification, pour les WebView et téléchargements de pièces jointes */
export function authHeaders(): Record<string, string> {
  return ctx.token ? { Authorization: `Bearer ${ctx.token}` } : {};
}

export const absoluteUrl = (path: string) => (path.startsWith("http") ? path : `${API_URL}${path}`);
