"use client";

import { ImageUp } from "lucide-react";
import { useState } from "react";
import { AuthCard, AuthField, AuthSubmit } from "@/components/auth-card";
import { LOGO_ACCEPT, useFilePreview } from "@/components/settings-appearance";
import { APP_NAME_MAX, DEFAULT_APP_NAME } from "@/lib/brand";

/** Création du premier compte administrateur (une seule fois), avec le nom et le logo de l'instance */
export default function SetupPage() {
  const [form, setForm] = useState({ setupPassword: "", name: "", email: "", password: "", confirm: "", appName: "" });
  const [logo, setLogo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const preview = useFilePreview(logo);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("Les deux mots de passe ne correspondent pas");
    setLoading(true);
    setError(null);
    const body = new FormData();
    for (const [k, v] of Object.entries(form)) if (k !== "confirm") body.set(k, v);
    if (logo) body.set("logo", logo);
    const res = await fetch("/api/auth/setup", { method: "POST", body }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (res?.ok) {
      // Rechargement complet : le nom et le favicon choisis sont rendus par le serveur
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
      return;
    }
    setError(data?.error ?? "Installation impossible");
    setLoading(false);
  };

  return (
    <AuthCard
      title="Installation"
      subtitle="Créez le compte administrateur. Le mot de passe d'installation est la valeur APP_PASSWORD du serveur."
      onSubmit={submit}
    >
      <AuthField label="Mot de passe d'installation" type="password" autoFocus value={form.setupPassword} onChange={set("setupPassword")} />
      <AuthField label="Votre nom" autoComplete="name" value={form.name} onChange={set("name")} />
      <AuthField label="Votre e-mail (identifiant)" type="email" autoComplete="username" value={form.email} onChange={set("email")} />
      <AuthField label="Mot de passe (10 caractères minimum)" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
      <AuthField label="Confirmer le mot de passe" type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />

      <div className="mb-3 mt-5 border-t border-line pt-4">
        <p className="text-[13px] font-semibold">Personnalisation (facultatif)</p>
        <p className="mt-0.5 text-xs text-subtle">Modifiable ensuite dans Réglages → Apparence.</p>
      </div>
      <AuthField label="Nom de l'instance" placeholder={DEFAULT_APP_NAME} maxLength={APP_NAME_MAX} value={form.appName} onChange={set("appName")} />
      <div className="mb-3">
        <span className="mb-1 block text-[13px] font-medium text-muted">Logo (sert aussi de favicon)</span>
        <div className="flex items-center gap-3">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-10 w-10 rounded-lg border border-line bg-white object-contain" />
          )}
          <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-hover">
            <ImageUp size={15} /> {logo ? "Changer" : "Choisir une image"}
            <input type="file" accept={LOGO_ACCEPT} className="sr-only" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          </label>
          {logo && (
            <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => setLogo(null)}>
              Retirer
            </button>
          )}
        </div>
        <span className="mt-1 block text-xs text-subtle">PNG, JPEG ou WebP carré, 512 × 512 px idéalement.</span>
      </div>

      {error && <p className="mb-1 text-[13px] text-danger">{error}</p>}
      <AuthSubmit loading={loading} disabled={!form.setupPassword || !form.email || !form.password}>
        Créer le compte administrateur
      </AuthSubmit>
    </AuthCard>
  );
}
