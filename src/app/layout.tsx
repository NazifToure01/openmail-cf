import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import { BrandingProvider } from "@/components/brand";
import { brandIconUrl } from "@/lib/brand";
import { getBranding } from "@/lib/settings";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Police du logo
// Police variable (toutes les graisses) : la liste weight provoque une erreur de Turbopack en dev
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

// Nom et logo choisis par l'administrateur : lus en base à chaque requête
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const branding = await getBranding();
  return {
    title: branding.name,
    applicationName: branding.name,
    description: "Messagerie multi-domaines : envoi et réception des e-mails de vos domaines via Cloudflare",
    icons: {
      icon: brandIconUrl(branding),
      apple: brandIconUrl(branding, "apple-icon.png"),
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1226" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  const branding = await getBranding();
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} h-full antialiased`}>
      <body className="h-full">
        <BrandingProvider value={branding}>{children}</BrandingProvider>
      </body>
    </html>
  );
}
