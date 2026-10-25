import { requireFeature } from "@/lib/ai";
import { semanticSearch } from "@/lib/ai-mail";
import { currentDomain } from "@/lib/domains";
import { handler, summarize } from "@/lib/server";
import { currentUser } from "@/lib/session";

/** Recherche par le sens : ?q=… → messages classés par pertinence */
export const GET = handler(async (request: Request) => {
  await requireFeature("search");
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const hits = await semanticSearch(currentUser(), (await currentDomain()).name, q);
  return Response.json({ messages: hits.map((h) => ({ ...summarize(h.message), score: Math.round(h.score * 1000) / 1000 })) });
});
