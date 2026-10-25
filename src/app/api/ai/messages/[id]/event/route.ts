import { eventToIcs } from "@/lib/ai-mail";
import { HttpError, handler } from "@/lib/server";
import { visibleMessage } from "../message";

/** Événement repéré par le tri, au format iCalendar : ?i=<numéro> */
export const GET = handler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const message = await visibleMessage(params);
  const index = Number(new URL(request.url).searchParams.get("i") ?? 0);
  const event = message.ai?.events?.[index];
  if (!event) throw new HttpError(404, "Événement introuvable");
  const name = (event.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "evenement").slice(0, 60);
  return new Response(eventToIcs(event, message), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}.ics"`,
      "Cache-Control": "no-store",
    },
  });
});
