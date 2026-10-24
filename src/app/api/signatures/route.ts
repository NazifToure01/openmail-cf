import { currentDomain } from "@/lib/domains";
import { handler, readJson } from "@/lib/server";
import { signatures } from "@/lib/store";
import { cleanSignature } from "@/lib/validators";
import type { Signature } from "@/lib/types";

/** Signatures du domaine choisi */
export const GET = handler(async () => {
  const domain = (await currentDomain()).name;
  return Response.json({ signatures: await signatures.find("domain = ?", [domain]) });
});

export const POST = handler(async (req: Request) => {
  const domain = (await currentDomain()).name;
  const data = cleanSignature(await readJson<Partial<Signature>>(req));
  const signature: Signature = { id: crypto.randomUUID(), domain, ...data };
  await signatures.insert(signature);
  return Response.json({ signature });
});
