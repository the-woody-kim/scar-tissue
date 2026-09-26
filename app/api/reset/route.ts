import { reset } from "@/lib/engine/harness";
import { acquire, holder, release } from "@/lib/engine/lock";
import { runtime } from "@/lib/engine/state";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  let token: string | null = null;
  try {
    token = await acquire("order-1");
    if (!token) return Response.json({ error: `busy: ${(await holder()) ?? "another run"}` }, { status: 409 });
    const before = runtime.reload;
    await reset();
    // The reset writes active_config; wait for the change stream to deliver that write, then clear it.
    for (let t = 0; runtime.watching && runtime.reload === before && t < 2000; t += 50) await new Promise((r) => setTimeout(r, 50));
    runtime.reload = null;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    if (token) await release(token);
  }
}
