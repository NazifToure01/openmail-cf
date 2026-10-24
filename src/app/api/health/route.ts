import { connection } from "next/server";
import { database } from "@/lib/db";

/** Vérifie que le serveur répond et que la base D1 est joignable (utilisé par l'app mobile et la supervision) */
export async function GET() {
  await connection();
  try {
    const started = Date.now();
    await (await database()).prepare("SELECT 1").first();
    return Response.json({ ok: true, db: "ok", latencyMs: Date.now() - started });
  } catch (err) {
    return Response.json({ ok: false, db: (err as Error).message }, { status: 503 });
  }
}
