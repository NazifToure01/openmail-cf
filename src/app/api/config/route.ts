import { isCloudflareConfigured } from "@/lib/cloudflare";
import { isInboxConfigured } from "@/lib/inbound";
import { currentDomain } from "@/lib/domains";
import { handler } from "@/lib/server";
import { MAX_MESSAGE_BYTES, MAX_RECIPIENTS } from "@/lib/addresses";

export const GET = handler(async () =>
  Response.json({
    domain: (await currentDomain()).name,
    cloudflareConfigured: isCloudflareConfigured(),
    inboxConfigured: isInboxConfigured(),
    // URL publique des logos pour les e-mails (les images doivent être accessibles depuis Internet)
    brandAssetsUrl:
      process.env.BRAND_ASSETS_URL?.replace(/\/+$/, "") ||
      (process.env.INBOX_WORKER_URL ? `${process.env.INBOX_WORKER_URL.replace(/\/+$/, "")}/brand` : null),
    maxMessageBytes: MAX_MESSAGE_BYTES,
    maxRecipients: MAX_RECIPIENTS,
  }),
);
