import { getFile, imageKey } from "@/lib/files";

/** Image publique d'un e-mail (lue par Gmail, Outlook… sans session) */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-f0-9-]{36}\.(png|jpg|gif)$/.test(name)) return new Response("Introuvable", { status: 404 });
  const file = await getFile(imageKey(name));
  if (!file) return new Response("Introuvable", { status: 404 });
  return new Response(file.data, {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
