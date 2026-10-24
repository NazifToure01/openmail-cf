"use client";

import { useState } from "react";
import { AuthCard, AuthField, AuthSubmit } from "@/components/auth-card";

/** Création du premier compte administrateur (une seule fois) */
export default function SetupPage() {
  const [form, setForm] = useState({ setupPassword: "", name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("Les deux mots de passe ne correspondent pas");
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (res?.ok) {
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
      {error && <p className="mb-1 text-[13px] text-danger">{error}</p>}
      <AuthSubmit loading={loading} disabled={!form.setupPassword || !form.email || !form.password}>
        Créer le compte administrateur
      </AuthSubmit>
    </AuthCard>
  );
}
