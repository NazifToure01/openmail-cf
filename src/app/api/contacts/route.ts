import { isValidEmail } from "@/lib/addresses";
import { HttpError, handler, readJson } from "@/lib/server";
import { contacts } from "@/lib/store";
import type { Contact } from "@/lib/types";

export const GET = handler(async (request: Request) => {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
  // instr() plutôt que LIKE : D1 limite les motifs LIKE à 50 octets
  const filter = q ? "instr(id, ?) > 0 OR instr(lower(coalesce(name, '')), ?) > 0" : undefined;
  const list = await contacts.find(filter, q ? [q, q] : [], "ORDER BY count DESC, last_used_at DESC LIMIT 500");
  return Response.json({ contacts: list });
});

export const POST = handler(async (req: Request) => {
  const body = await readJson<Partial<Contact>>(req);
  const address = String(body.address ?? "").trim().toLowerCase();
  if (!isValidEmail(address)) throw new HttpError(400, "Adresse e-mail invalide");
  const name = String(body.name ?? "").trim().slice(0, 120) || undefined;
  let contact = await contacts.update(address, name ? { set: { name } } : { unset: ["name"] });
  if (!contact) {
    contact = { address, ...(name ? { name } : {}), count: 0, lastUsedAt: new Date().toISOString() };
    await contacts.insert(contact);
  }
  return Response.json({ contact });
});

export const DELETE = handler(async (request: Request) => {
  const address = (new URL(request.url).searchParams.get("address") ?? "").toLowerCase();
  await contacts.remove(address);
  return Response.json({ ok: true });
});
