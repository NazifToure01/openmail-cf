import type { Message } from "./types";

/** Adresses @domaine auxquelles un message appartient : réception (destinataire) ou envoi (expéditeur) */
export function mailboxAddresses(m: Message, domain: string): string[] {
  const own = (a: string) => a.toLowerCase().endsWith(`@${domain}`);
  if (m.direction === "in") {
    if (m.deliveredTo) return [m.deliveredTo];
    return [...new Set([...m.to, ...m.cc].map((a) => a.address).filter(own))];
  }
  return m.from.address && own(m.from.address) ? [m.from.address.toLowerCase()] : [];
}

/** Le message appartient-il à ce domaine ? (adresse @domaine en réception ou en envoi, sinon domaine enregistré) */
export function inDomain(m: Message, domain: string): boolean {
  if (m.domain) return m.domain === domain;
  return mailboxAddresses(m, domain).length > 0;
}
