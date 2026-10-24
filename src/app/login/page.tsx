"use client";

import { useEffect, useState } from "react";
import { AuthCard, AuthField, AuthSubmit } from "@/components/auth-card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Aucun compte encore : on propose l'installation
  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((d: { needsSetup?: boolean }) => {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        if (d.needsSetup) window.location.href = "/setup";
      })
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);
    if (res?.ok) {
      // Rechargement complet volontaire (cookie de session)
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/domaine";
      return;
    }
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setError(data?.error ?? "Connexion impossible");
    setLoading(false);
  };

  return (
    <AuthCard title="Connexion" subtitle="Connectez-vous pour envoyer et recevoir les e-mails de vos domaines." onSubmit={submit}>
      <AuthField label="E-mail" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      <AuthField label="Mot de passe" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="mb-1 text-[13px] text-danger">{error}</p>}
      <AuthSubmit loading={loading} disabled={!email || !password}>
        Se connecter
      </AuthSubmit>
    </AuthCard>
  );
}
