/** Mise en forme partagée avec l'app web (dates, tailles, citations d'e-mails) */

const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const yearFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const fullFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" });

export function formatListDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return timeFmt.format(d);
  return d.getFullYear() === now.getFullYear() ? dayFmt.format(d) : yearFmt.format(d);
}

export const formatFullDate = (iso: string) => fullFmt.format(new Date(iso));

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1048576).toFixed(1).replace(".", ",")} Mo`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Contenu d'un e-mail (sans enveloppe ni feuilles de style), pour le citer */
export function extractEmailContent(html: string): string {
  const start = html.indexOf("<!--mb:start-->");
  const end = html.indexOf("<!--mb:end-->");
  let content = html;
  if (start !== -1 && end > start) content = html.slice(start + 15, end);
  else {
    const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (body) content = body[1];
  }
  return content.replace(/<style[\s\S]*?<\/style>/gi, "");
}

export const withPrefix = (prefix: string, subject: string) =>
  new RegExp(`^${prefix}\\s*:`, "i").test(subject) ? subject : `${prefix} : ${subject}`;

export function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
