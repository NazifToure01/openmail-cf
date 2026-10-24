/**
 * Sessions et mots de passe (Web Crypto, utilisable dans proxy.ts et les route handlers).
 *
 * Jeton : base64url({ uid, v, exp }) + "." + HMAC-SHA256(SESSION_SECRET)
 * - web : cookie httpOnly « mb_session »
 * - mobile : en-tête « Authorization: Bearer <jeton> »
 * `v` (tokenVersion de l'utilisateur) permet de révoquer toutes ses sessions.
 */

export const SESSION_COOKIE = "mb_session";
export const SESSION_DAYS = 30;

export type SessionPayload = { uid: string; v: number; exp: number };

const encoder = new TextEncoder();

const b64url = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes as ArrayBuffer).toString("base64url");

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET manquant ou trop court (16 caractères minimum)");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSessionToken(uid: string, tokenVersion: number, days = SESSION_DAYS): Promise<string> {
  const payload: SessionPayload = { uid, v: tokenVersion, exp: Date.now() + days * 24 * 60 * 60 * 1000 };
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(body));
  return `${body}.${b64url(signature)}`;
}

/** Vérifie la signature et l'expiration (sans base de données). L'utilisateur est vérifié ensuite. */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), Buffer.from(signature, "base64url"), encoder.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.uid !== "string" || typeof payload.v !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Jeton depuis l'en-tête Authorization (mobile) ou le cookie (web) */
export function tokenFromRequest(headers: Headers, cookie: string | undefined): string | undefined {
  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return cookie;
}

/* ---------- Mots de passe : PBKDF2-SHA256 ---------- */

const ITERATIONS = 100_000;

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !saltB64 || !hashB64) return false;
  const expected = new Uint8Array(Buffer.from(hashB64, "base64url"));
  const actual = new Uint8Array(await derive(password, new Uint8Array(Buffer.from(saltB64, "base64url")), Number(iter)));
  if (actual.length !== expected.length) return false;
  // Comparaison en temps constant
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Le mot de passe doit contenir au moins 10 caractères";
  if (password.length > 200) return "Mot de passe trop long";
  return null;
}
