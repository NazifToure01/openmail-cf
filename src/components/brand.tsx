"use client";

import { createContext, useContext } from "react";
import { DEFAULT_BRANDING, brandIconUrl, type Branding } from "@/lib/brand";
import { cn } from "./ui";

/** URL publique des logos (ex. https://openmail-cf-inbox.….workers.dev/brand), null si non configurée */
const BrandAssetsContext = createContext<string | null>(null);
export const BrandAssetsProvider = BrandAssetsContext.Provider;
export const useBrandAssetsUrl = () => useContext(BrandAssetsContext);

/** Nom et logo de l'instance (lus par le layout racine) */
const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);
export const BrandingProvider = BrandingContext.Provider;
export const useBranding = () => useContext(BrandingContext);

/** Icône de l'app : logo personnalisé, sinon enveloppe au rabat arrondi avec point orange */
export function AppIcon({ className, custom = true }: { className?: string; custom?: boolean }) {
  const branding = useBranding();
  if (custom && branding.logoVersion) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brandIconUrl(branding)} alt="" className={cn("rounded-[22%] object-contain", className)} />;
  }
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#101C3B" />
      <rect x="11" y="18" width="42" height="29" rx="6" fill="#F7F7F5" />
      <path d="M13.5 21.5C20 35 44 35 50.5 21.5" stroke="#101C3B" strokeWidth="2.8" strokeLinecap="round" fill="none" />
      <circle cx="50" cy="17" r="6.2" fill="#F5A524" stroke="#101C3B" strokeWidth="2.5" />
    </svg>
  );
}

/** Logo de l'app : icône + nom de l'instance en Manrope ExtraBold */
export function AppLogo({ className }: { className?: string }) {
  const { name } = useBranding();
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <AppIcon className="h-[1.3em] w-[1.3em]" />
      <span className="font-brand font-extrabold tracking-[-0.04em]" style={{ color: "var(--brand-ink)" }}>
        {name}
      </span>
    </span>
  );
}
