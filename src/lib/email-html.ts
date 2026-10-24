/**
 * Transforme le HTML produit par l'éditeur en HTML compatible avec les
 * clients mail (styles en ligne) et en version texte brut.
 * Module partagé client / serveur : aucune dépendance au DOM.
 */

const BASE_FONT = "font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2937;";

const TAG_STYLES: Record<string, string> = {
  p: "margin:0 0 12px 0;",
  h1: "margin:0 0 12px 0;font-size:24px;line-height:1.3;",
  h2: "margin:0 0 12px 0;font-size:20px;line-height:1.3;",
  h3: "margin:0 0 12px 0;font-size:17px;line-height:1.3;",
  ul: "margin:0 0 12px 0;padding-left:24px;",
  ol: "margin:0 0 12px 0;padding-left:24px;",
  li: "margin:0 0 4px 0;",
  blockquote: "margin:0 0 12px 0;padding:4px 0 4px 12px;border-left:3px solid #d1d5db;color:#4b5563;",
  a: "color:#2563eb;text-decoration:underline;",
  img: "max-width:100%;height:auto;border:0;",
  hr: "border:0;border-top:1px solid #e5e7eb;margin:16px 0;",
  pre: "margin:0 0 12px 0;padding:12px;background:#f3f4f6;border-radius:6px;font-family:Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap;",
  code: "font-family:Menlo,Consolas,monospace;font-size:13px;background:#f3f4f6;padding:1px 4px;border-radius:4px;",
  mark: "padding:0 2px;",
};

const START = "<!--mb:start-->";
const END = "<!--mb:end-->";

export function inlineEmailStyles(html: string): string {
  // Les paragraphes vides de l'éditeur doivent garder leur hauteur
  let out = html.replace(/<p([^>]*)><\/p>/g, "<p$1><br></p>");
  for (const [tag, style] of Object.entries(TAG_STYLES)) {
    const re = new RegExp(`<${tag}(\\s[^>]*)?>`, "gi");
    out = out.replace(re, (_m, attrs: string | undefined = "") => {
      if (/\sstyle\s*=\s*"/i.test(attrs)) {
        return `<${tag}${attrs.replace(/\sstyle\s*=\s*"/i, ` style="${style}`)}>`;
      }
      return `<${tag}${attrs} style="${style}">`;
    });
  }
  // Ouvrir les liens dans un nouvel onglet
  out = out.replace(/<a(\s[^>]*)?>/gi, (m) => (/target=/i.test(m) ? m : m.replace(/^<a/i, '<a target="_blank"')));
  return out;
}

export function buildEmailHtml(parts: {
  bodyHtml: string;
  signatureHtml?: string | null;
  quotedHtml?: string | null;
}): string {
  let content = parts.bodyHtml || "";
  if (parts.signatureHtml) {
    content += `<div class="mb-signature" style="margin-top:20px;">${parts.signatureHtml}</div>`;
  }
  if (parts.quotedHtml) {
    content += `<div class="mb-quote" style="margin-top:24px;">${parts.quotedHtml}</div>`;
  }
  return [
    "<!DOCTYPE html>",
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light"></head>',
    `<body style="margin:0;padding:0;background:#ffffff;"><div style="${BASE_FONT}padding:4px;">`,
    START,
    inlineEmailStyles(content),
    END,
    "</div></body></html>",
  ].join("");
}

/** Récupère le contenu (sans enveloppe ni feuilles de style) d'un message, pour le citer */
export function extractEmailContent(html: string): string {
  const s = html.indexOf(START);
  const e = html.indexOf(END);
  let content = html;
  if (s !== -1 && e > s) content = html.slice(s + START.length, e);
  else {
    const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (body) content = body[1];
  }
  // Une feuille de style citée s'appliquerait à toute la réponse
  return content.replace(/<style[\s\S]*?<\/style>/gi, "");
}

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  laquo: "«",
  raquo: "»",
  euro: "€",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+[0-9]*);/gi, (m, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#") && lower !== "#39") return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return ENTITIES[lower] ?? m;
  });
}

export function htmlToText(html: string | null | undefined): string {
  let t = html ?? "";
  t = t.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "");
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
    const text = label.replace(/<[^>]+>/g, "").trim();
    if (!href || href.startsWith("#")) return text;
    if (!text || text === href || `mailto:${text}` === href) return href.replace(/^mailto:/, "");
    return `${text} (${href})`;
  });
  t = t.replace(/<img\s[^>]*alt="([^"]+)"[^>]*>/gi, "[$1]");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<hr[^>]*>/gi, "\n----------\n");
  t = t.replace(/<li[^>]*>/gi, "\n• ");
  t = t.replace(/<blockquote[^>]*>/gi, "\n");
  t = t.replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|pre|tr|table)>/gi, "\n\n");
  t = t.replace(/<[^>]+>/g, "");
  t = decodeEntities(t);
  return t
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Estimation de la taille MIME : le base64 grossit les fichiers d'environ 4/3 */
export function estimateMessageBytes(htmlLength: number, attachmentSizes: number[]): number {
  const attachments = attachmentSizes.reduce((sum, s) => sum + Math.ceil(s / 3) * 4 + 300, 0);
  return htmlLength * 2 + attachments + 2048;
}
