"use client";

import type { ReactNode } from "react";
import { AppLogo } from "./brand";
import { Spinner } from "./ui";

/** Cadre commun des écrans de connexion, d'installation et de choix du domaine */
export function AuthCard({ title, subtitle, children, onSubmit }: { title: string; subtitle: string; children: ReactNode; onSubmit: (e: React.FormEvent) => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-pop">
        <AppLogo className="mb-6 text-[26px]" />
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>
        {children}
      </form>
    </div>
  );
}

export function AuthField({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[13px] font-medium text-muted">{label}</span>
      <input
        {...props}
        className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </label>
  );
}

export function AuthSubmit({ loading, disabled, children }: { loading: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
    >
      {loading && <Spinner />} {children}
    </button>
  );
}
