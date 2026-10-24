import type { Address } from "./types";

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export const LOCAL_PART_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._+-]{0,62}[a-zA-Z0-9])?$/;

export const MAX_RECIPIENTS = 50;
/** Taille totale maximale d'un message chez Cloudflare (pièces jointes incluses) */
export const MAX_MESSAGE_BYTES = 5 * 1024 * 1024;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

export function belongsToDomain(address: string, domain: string): boolean {
  const at = address.lastIndexOf("@");
  if (at < 1) return false;
  return (
    LOCAL_PART_RE.test(address.slice(0, at)) &&
    address.slice(at + 1).toLowerCase() === domain.toLowerCase()
  );
}

/** Analyse « Nom <email> », « "Nom" <email> » ou « email » */
export function parseAddress(raw: string): Address | null {
  const value = raw.trim().replace(/[;,]+$/, "");
  if (!value) return null;
  const m = value.match(/^(.*?)\s*<([^<>]+)>$/);
  if (m) {
    const name = m[1].trim().replace(/^"|"$/g, "").trim();
    const address = m[2].trim().toLowerCase();
    return name ? { address, name } : { address };
  }
  return { address: value.toLowerCase() };
}

/** Découpe un texte collé contenant plusieurs adresses */
export function parseAddressList(raw: string): Address[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngle = false;
  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === "<") inAngle = true;
    if (ch === ">") inAngle = false;
    if (!inQuotes && !inAngle && (ch === "," || ch === ";" || ch === "\n")) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map(parseAddress).filter((a): a is Address => a !== null);
}

export function formatAddress(a: Address): string {
  return a.name ? `${a.name} <${a.address}>` : a.address;
}

export function displayName(a: Address): string {
  return a.name || a.address;
}

export function dedupeAddresses(list: Address[]): Address[] {
  const seen = new Set<string>();
  return list.filter((a) => {
    const key = a.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
