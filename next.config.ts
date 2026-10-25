import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Tests (npm test) : dossier de build séparé, pour tourner à côté de `npm run dev`
  ...(process.env.OPENMAIL_STATE_DIR ? { distDir: ".next-test" } : {}),
  /* config options here */
  // Cache Components / Partial Prefetching désactivés : non pris en charge par l'adaptateur
  // Cloudflare (OpenNext), et inutiles ici (pages clientes + API dynamiques)
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// `next dev` : accès local aux bindings Cloudflare (R2, Images…) déclarés dans wrangler.jsonc.
// OPENMAIL_STATE_DIR (tests) : données locales isolées, pour ne pas toucher à celles du développement.
initOpenNextCloudflareForDev(process.env.OPENMAIL_STATE_DIR ? { persist: { path: `${process.env.OPENMAIL_STATE_DIR}/v3` } } : undefined);
