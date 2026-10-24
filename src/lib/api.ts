"use client";

import type { AttachmentMeta, LibraryImage } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
  }
}

export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    // Rechargement complet volontaire (cookie de session)
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
    throw new ApiError(401, "Session expirée");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 409 && (data as { code?: string }).code === "domain_required") {
    // Rechargement complet volontaire vers le choix du domaine
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/domaine";
    throw new ApiError(409, "Choisissez un domaine");
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `Erreur ${res.status}`, data);
  return data as T;
}

/** Envoi de fichier avec suivi de progression (fetch ne le permet pas) */
export function uploadAttachment(file: File, onProgress: (ratio: number) => void): Promise<AttachmentMeta> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.open("POST", "/api/attachments");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: { attachment?: AttachmentMeta; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      // Rechargement complet volontaire (cookie de session)
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (xhr.status === 401) window.location.href = "/login";
      if (xhr.status >= 200 && xhr.status < 300 && data.attachment) resolve(data.attachment);
      else reject(new Error(data.error || `Échec de l'envoi (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Erreur réseau pendant l'envoi du fichier"));
    xhr.send(form);
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1048576).toFixed(1).replace(".", ",")} Mo`;
}

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
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));

/** Héberge une image pour l'insérer dans un e-mail (ou réutilise la même image déjà importée) */
export async function uploadImage(file: File): Promise<LibraryImage & { reused?: boolean }> {
  const form = new FormData();
  form.append("file", file);
  return api<LibraryImage & { reused?: boolean }>("/api/images", { method: "POST", body: form });
}
