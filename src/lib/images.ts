import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Préparation des images d'e-mail avec le binding Cloudflare Images (« IMAGES ») :
 * 1200 px de large maximum, PNG si l'image peut être transparente, JPEG sinon, GIF conservé.
 * Sans binding (rare), l'image est gardée telle quelle si son format est lisible partout.
 */

type ImagesBinding = {
  info(stream: ReadableStream<Uint8Array>): Promise<{ format: string; fileSize?: number; width?: number; height?: number }>;
  input(stream: ReadableStream<Uint8Array>): {
    transform(t: { width?: number; fit?: "scale-down" }): {
      output(o: { format: "image/png" | "image/jpeg"; quality?: number; background?: string }): Promise<{ response(): Response }>;
    };
  };
};

export type PreparedImage = { data: Uint8Array<ArrayBuffer>; type: "image/png" | "image/jpeg" | "image/gif"; ext: "png" | "jpg" | "gif"; width: number; height: number };

const MAX_WIDTH = 1200;
const stream = (bytes: Uint8Array<ArrayBuffer>) => new Blob([bytes]).stream();

export async function prepareImage(input: Uint8Array<ArrayBuffer>): Promise<PreparedImage> {
  const { env } = await getCloudflareContext({ async: true });
  const images = (env as unknown as { IMAGES?: ImagesBinding }).IMAGES;
  if (!images) throw new Error("Le traitement d'images (binding « IMAGES ») n'est pas configuré");

  const info = await images.info(stream(input)).catch(() => {
    throw new Error("Format d'image non reconnu (PNG, JPEG, GIF, WebP, HEIC…)");
  });
  if (info.format === "image/svg+xml") throw new Error("Les images SVG ne s'affichent pas dans Gmail et Outlook : utilisez un PNG");

  // GIF (souvent animé) conservé tel quel s'il reste raisonnable
  if (info.format === "image/gif" && input.byteLength <= 4 * 1024 * 1024) {
    return { data: input, type: "image/gif", ext: "gif", width: info.width ?? 0, height: info.height ?? 0 };
  }

  const keepAlpha = info.format === "image/png" || info.format === "image/webp" || info.format === "image/gif";
  const out = await images
    .input(stream(input))
    .transform({ width: MAX_WIDTH, fit: "scale-down" })
    .output(keepAlpha ? { format: "image/png" } : { format: "image/jpeg", quality: 84, background: "#ffffff" });
  const data = new Uint8Array(await out.response().arrayBuffer());
  const final = await images.info(stream(data));
  return {
    data,
    type: keepAlpha ? "image/png" : "image/jpeg",
    ext: keepAlpha ? "png" : "jpg",
    width: final.width ?? 0,
    height: final.height ?? 0,
  };
}
