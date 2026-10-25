import { requireFeature } from "@/lib/ai";
import { askMailbox } from "@/lib/ai-mail";
import { currentDomain } from "@/lib/domains";
import { handler, readJson, summarize } from "@/lib/server";
import { currentUser } from "@/lib/session";

/** Question sur la boîte : { question } → { answer, sources } (sources numérotées comme dans la réponse) */
export const POST = handler(async (request: Request) => {
  await requireFeature("search");
  const { question } = await readJson<{ question?: string }>(request);
  const result = await askMailbox(currentUser(), (await currentDomain()).name, String(question ?? ""));
  return Response.json({ answer: result.answer, sources: result.sources.map(summarize) });
});
