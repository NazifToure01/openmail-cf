"use client";

import { ArrowRight, ChevronDown, Globe, LogOut, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { AppLogo } from "@/components/brand";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";

type DomainOption = { name: string; reception: boolean };

export default function DomainPage() {
  const [domains, setDomains] = useState<DomainOption[] | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const load = (refresh: boolean) =>
    api<{ domains: DomainOption[]; current: string | null }>(`/api/domains${refresh ? "?refresh" : ""}`)
      .then((d) => {
        setDomains(d.domains);
        console.log(d.domains);
        setSelected((cur) => (cur && d.domains.some((x) => x.name === cur) ? cur : (d.current ?? d.domains[0]?.name ?? "")));
      })
      .catch((err: Error) => setError(err.message));

  useEffect(() => {
    void load(false);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await api("/api/domains", { method: "POST", json: { domain: selected } });
      // Rechargement complet : toute l'app repart sur le nouveau domaine
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-pop">
        <AppLogo className="mb-6 text-[26px]" />
        <h1 className="text-lg font-semibold tracking-tight">Choisissez un domaine</h1>
        <p className="mb-6 mt-1 text-sm text-muted">
          Vous enverrez et recevrez les e-mails de ce domaine. Vous pourrez en changer à tout moment depuis la barre latérale.
        </p>

        {domains === null && !error ? (
          <div className="flex justify-center py-4 text-muted">
            <Spinner />
          </div>
        ) : domains && domains.length === 0 ? (
          <p className="rounded-lg bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
            Aucun domaine configuré. Renseignez <code>MAIL_DOMAIN</code> dans <code>.env</code> (ex.{" "}
            <code>example.com</code> ou <code>example.com,example.org</code>), puis relancez <code>npm run deploy</code>.
          </p>
        ) : (
          domains && (
            <>
              <label className="mb-1 block text-[13px] font-medium text-muted" htmlFor="domain">
                Domaine
              </label>
              <div className="relative">
                <Globe size={15} className="pointer-events-none absolute left-3 top-3 text-subtle" />
                <select
                  id="domain"
                  autoFocus
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="h-10 w-full appearance-none rounded-lg border border-line bg-surface pl-9 pr-9 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                >
                  {domains.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-muted" />
              </div>
              <button
                type="button"
                disabled={refreshing}
                onClick={() => {
                  setRefreshing(true);
                  void load(true).finally(() => setRefreshing(false));
                }}
                className="mt-1.5 flex items-center gap-1 text-xs text-subtle hover:text-fg disabled:opacity-50"
              >
                <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Recherche dans Cloudflare…" : "Actualiser la liste depuis Cloudflare"}
              </button>
            </>
          )
        )}

        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}

        <button
          type="submit"
          disabled={saving || !selected}
          className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? <Spinner /> : null} Continuer <ArrowRight size={15} />
        </button>
        <button
          type="button"
          onClick={logout}
          className="mx-auto mt-4 flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"
        >
          <LogOut size={13} /> Se déconnecter
        </button>
      </form>
    </div>
  );
}
