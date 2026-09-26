import { runBeat, type Pick } from "@/lib/engine/harness";
import { acquire, holder, release } from "@/lib/engine/lock";
import { consoleState } from "@/lib/engine/state";
import type { BeatId } from "@/lib/state";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BEATS: BeatId[] = ["order-1", "order-2", "grant-issue_refund", "refund-1", "order-n"];
const PICKS: Pick[] = ["after_commit", "before_commit", "after_commit_lookup_down", "none"];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { beat?: BeatId; fault?: Pick };
  if (!body.beat || !BEATS.includes(body.beat)) return Response.json({ error: "unknown beat" }, { status: 400 });
  if (body.fault && !PICKS.includes(body.fault)) return Response.json({ error: "unknown fault" }, { status: 400 });
  let token: string | null = null;
  try {
    token = await acquire(body.beat); // atomic in Atlas, so two clicks on two instances can't both run
    if (!token) return Response.json({ error: `busy: ${(await holder()) ?? "another run"}` }, { status: 409 });
    const next = (await consoleState()).beats.find((b) => b.status === "next")?.id;
    if (body.beat !== "order-n" && body.beat !== next) return Response.json({ error: `run ${next ?? "Reset demo"} first` }, { status: 409 });
    await runBeat(body.beat, body.fault);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    if (token) await release(token);
  }
}
