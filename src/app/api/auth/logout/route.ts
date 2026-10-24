import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { DOMAIN_COOKIE } from "@/lib/domains";

export async function POST() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(DOMAIN_COOKIE);
  return Response.json({ ok: true });
}
