import { requireFeature } from "@/lib/ai";
import { WRITE_ACTIONS, writeWithAi, type WriteInput } from "@/lib/ai-mail";
import { HttpError, handler, readJson } from "@/lib/server";
import { currentUser } from "@/lib/session";

/** Aide à la rédaction : { action, text?, instruction?, language?, subject?, replyTo? } → { text, html } */
export const POST = handler(async (request: Request) => {
  await requireFeature("compose");
  const body = await readJson<Partial<WriteInput>>(request);
  if (!WRITE_ACTIONS.includes(body.action as WriteInput["action"])) throw new HttpError(400, "Action inconnue");
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return Response.json(
    await writeWithAi(
      {
        action: body.action as WriteInput["action"],
        text: str(body.text),
        instruction: str(body.instruction),
        language: str(body.language),
        subject: str(body.subject),
        replyTo: str(body.replyTo),
      },
      currentUser(),
    ),
  );
});
