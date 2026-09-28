import { refuseInDemo } from "@/lib/engine/demo";
import { runPrompt, type Pick } from "@/lib/engine/harness";
import { acquire, holder, release } from "@/lib/engine/lock";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PICKS: Pick[] = ["after_commit", "before_commit", "after_commit_lookup_down", "none"];
const MAX = 400;

// POST /api/try { prompt, fault? } — a visitor's own request, run by the agent on the active policy
// and judged by the fixed invariants. Any time after a reset; one run at a time, like the beats.
export async function POST(req: Request) {
  const refused = refuseInDemo();
  if (refused) return refused;
  const body = (await req.json().catch(() => ({}))) as { prompt?: unknown; fault?: Pick };
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return Response.json({ error: "type a request first" }, { status: 400 });
  if (prompt.length > MAX) return Response.json({ error: `keep it under ${MAX} characters` }, { status: 400 });
  if (body.fault && !PICKS.includes(body.fault)) return Response.json({ error: "unknown fault" }, { status: 400 });
  let token: string | null = null;
  try {
    token = await acquire("prompt"); // atomic in Atlas, so two clicks on two instances can't both run
    if (!token) return Response.json({ error: `busy: ${(await holder()) ?? "another run"}` }, { status: 409 });
    await runPrompt(prompt, body.fault);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    if (token) await release(token);
  }
}
