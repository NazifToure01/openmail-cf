import "server-only";
import { isValidEmail } from "./addresses";
import { HttpError } from "./errors";
import type { User } from "./store";

/** Valide les droits envoyés par l'administrateur */
export function cleanAccess(raw: unknown, knownDomains: string[]): User["access"] {
  if (!Array.isArray(raw)) return [];
  const out: User["access"] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { domain, mailboxes } = entry as { domain?: unknown; mailboxes?: unknown };
    const d = String(domain ?? "").toLowerCase();
    if (!knownDomains.includes(d)) throw new HttpError(400, `Domaine inconnu : ${d}`);
    if (mailboxes === "*") {
      out.push({ domain: d, mailboxes: "*" });
      continue;
    }
    const list = Array.isArray(mailboxes) ? mailboxes.map((m) => String(m).trim().toLowerCase()).filter(Boolean) : [];
    for (const m of list) {
      if (!isValidEmail(m) || !m.endsWith(`@${d}`)) throw new HttpError(400, `Boîte invalide pour ${d} : ${m}`);
    }
    if (list.length) out.push({ domain: d, mailboxes: [...new Set(list)] });
  }
  return out;
}
