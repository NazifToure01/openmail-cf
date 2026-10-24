import type { AppUser } from "./types";

/** Résumé lisible des droits d'un compte */
export function describeAccess(u: AppUser) {
  if (u.role === "admin") return "Administrateur · tous les domaines";
  if (!u.access?.length) return "Aucun accès";
  return u.access
    .map((a) => (a.mailboxes === "*" ? `${a.domain} (toutes les boîtes)` : Array.isArray(a.mailboxes) ? a.mailboxes.join(", ") : String(a.mailboxes)))
    .join(" · ");
}

