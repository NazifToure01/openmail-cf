"use client";

import { createContext, useContext } from "react";
import { APP_NAME } from "@/lib/brand";
import { cn } from "./ui";

/** URL publique des logos (ex. https://openmail-cf-inbox.….workers.dev/brand), null si non configurée */
const BrandAssetsContext = createContext<string | null>(null);
export const BrandAssetsProvider = BrandAssetsContext.Provider;
export const useBrandAssetsUrl = () => useContext(BrandAssetsContext);

/** Icône de l'app : enveloppe au rabat arrondi, point orange de notification */
export function AppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#101C3B" />
      <rect x="11" y="18" width="42" height="29" rx="6" fill="#F7F7F5" />
      <path d="M13.5 21.5C20 35 44 35 50.5 21.5" stroke="#101C3B" strokeWidth="2.8" strokeLinecap="round" fill="none" />
      <circle cx="50" cy="17" r="6.2" fill="#F5A524" stroke="#101C3B" strokeWidth="2.5" />
    </svg>
  );
}

/** Logo de l'app : icône + nom en Manrope ExtraBold */
export function AppLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <AppIcon className="h-[1.3em] w-[1.3em]" />
      <span className="font-brand font-extrabold tracking-[-0.04em]" style={{ color: "var(--brand-ink)" }}>
        {APP_NAME}
      </span>
    </span>
  );
}
