import "server-only";
import type { Address, SendResult } from "./types";

export type CloudflareAttachment = {
  content: string; // base64
  filename: string;
  type: string;
  disposition: "attachment" | "inline";
};

export type CloudflareSendBody = {
  from: string | { address: string; name: string };
  to: (string | { address: string; name: string })[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: CloudflareAttachment[];
  headers?: Record<string, string>;
};

export class CloudflareError extends Error {}

export function isCloudflareConfigured() {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
}

export function toCloudflareAddress(a: Address) {
  return a.name ? { address: a.address, name: a.name } : a.address;
}

/** https://developers.cloudflare.com/email-service/api/send-emails/rest-api/ */
export async function sendWithCloudflare(body: CloudflareSendBody): Promise<SendResult> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new CloudflareError("CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID doivent être définis dans .env.local");
  }

  let res: Response;
  try {
    const base = process.env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4";
    res = await fetch(`${base}/accounts/${accountId}/email/sending/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    throw new CloudflareError(`Impossible de joindre l'API Cloudflare : ${(err as Error).message}`);
  }

  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    errors?: { code: number; message: string }[];
    result?: SendResult | null;
  } | null;

  if (!res.ok || !json?.success || !json.result) {
    const details = json?.errors?.map((e) => `${e.message} (code ${e.code})`).join(" ; ");
    if (res.status === 429) throw new CloudflareError(`Trop d'envois, réessayez plus tard. ${details ?? ""}`.trim());
    throw new CloudflareError(details || `Erreur HTTP ${res.status} de l'API Cloudflare`);
  }

  return {
    delivered: json.result.delivered ?? [],
    queued: json.result.queued ?? [],
    permanent_bounces: json.result.permanent_bounces ?? [],
    suppressed_recipients: json.result.suppressed_recipients ?? [],
    message_id: json.result.message_id,
  };
}
