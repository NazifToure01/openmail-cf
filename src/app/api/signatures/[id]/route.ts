import { HttpError, handler, readJson } from "@/lib/server";
import { identities, signatures } from "@/lib/store";
import type { Signature } from "@/lib/types";
import { cleanSignature } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const data = cleanSignature(await readJson<Partial<Signature>>(req));
  const signature = await signatures.update(id, { set: data });
  if (!signature) throw new HttpError(404, "Signature introuvable");
  return Response.json({ signature });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await signatures.remove(id);
  await identities.updateWhere("signature_id = ?", [id], { set: { signatureId: null } });
  return Response.json({ ok: true });
});
