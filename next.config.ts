import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
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

// `next dev` : accès local aux bindings Cloudflare (R2, Images…) déclarés dans wrangler.jsonc
initOpenNextCloudflareForDev();
