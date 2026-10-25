import { brandKey, getFile } from "@/lib/files";

/**
 * Logo de l'instance (public : favicon, page de connexion, e-mails).
 * Sans logo personnalisé, redirige vers l'icône par défaut du dossier public/.
 */
const FILES = { "icon.png": "/default-icon.svg", "apple-icon.png": "/default-apple-icon.png" } as const;

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!(file in FILES)) return new Response("Not found", { status: 404 });
  const name = file as keyof typeof FILES;
  const stored = await getFile(brandKey(name)).catch(() => null);
  if (!stored) {
    return new Response(null, { status: 307, headers: { Location: FILES[name], "Cache-Control": "no-store" } });
  }
  // L'URL versionnée (?v=…) change à chaque nouveau logo : elle peut être mise en cache longtemps
  const versioned = new URL(request.url).searchParams.has("v");
  return new Response(stored.data, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
