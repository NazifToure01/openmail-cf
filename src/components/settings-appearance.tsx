"use client";

import { ImageUp, Palette, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { APP_NAME_MAX, brandIconUrl, type Branding } from "@/lib/brand";
import { AppIcon, useBranding } from "./brand";
import { Button, Field, inputClass, useToast } from "./ui";

/** Formats acceptés pour le logo (redimensionné en PNG carré par le serveur) */
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";

/** Aperçu local d'un fichier choisi (URL libérée au changement) */
export function useFilePreview(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

/** Réglages → Apparence (administrateur) : nom de l'instance et logo (favicon, en-tête, e-mails) */
export function AppearanceSettings() {
  const toast = useToast();
  const branding = useBranding();
  const [name, setName] = useState(branding.name);
  const [logo, setLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const preview = useFilePreview(logo);

  const dirty = name.trim() !== branding.name || !!logo || removeLogo;

  const save = async () => {
    setSaving(true);
    const form = new FormData();
    form.set("name", name.trim());
    if (logo) form.set("logo", logo);
    if (removeLogo) form.set("removeLogo", "true");
    try {
      await api<Branding>("/api/branding", { method: "PUT", body: form });
      toast("Apparence mise à jour", "success");
      // Le nom et le favicon sont rendus par le serveur : on recharge la page
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      toast((err as Error).message, "error");
      setSaving(false);
    }
  };

  const current = removeLogo ? null : (preview ?? (branding.logoVersion ? brandIconUrl(branding) : null));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Apparence</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Nom et logo de votre instance : titre de l&apos;onglet, favicon, icône d&apos;écran d&apos;accueil, pages de connexion et en-tête.
        </p>
      </div>
      <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Palette size={15} /> Identité
        </h2>
        <Field label="Nom de l'instance">
          <input className={inputClass} value={name} maxLength={APP_NAME_MAX} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Logo" hint="PNG, JPEG ou WebP carré, 512 × 512 px idéalement (5 Mo max). Il sert aussi de favicon.">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-line bg-white">
              {current ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current} alt="" className="h-full w-full object-contain" />
              ) : (
                <AppIcon className="h-full w-full" custom={false} />
              )}
            </span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-hover">
              <ImageUp size={15} /> Choisir une image
              <input
                type="file"
                accept={LOGO_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  setLogo(e.target.files?.[0] ?? null);
                  setRemoveLogo(false);
                  e.target.value = "";
                }}
              />
            </label>
            {(logo || (branding.logoVersion && !removeLogo)) && (
              <Button
                onClick={() => {
                  setLogo(null);
                  setRemoveLogo(!!branding.logoVersion);
                }}
              >
                <Trash2 size={15} /> Logo par défaut
              </Button>
            )}
          </div>
        </Field>
        <Button variant="primary" onClick={save} disabled={saving || !dirty || !name.trim()}>
          Enregistrer
        </Button>
      </section>
    </>
  );
}

