import { reset } from "@/lib/engine/harness";
import { runtime } from "@/lib/engine/state";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  if (runtime.running) return Response.json({ error: `busy: ${runtime.running}` }, { status: 409 });
  runtime.running = "order-1";
  try {
    const before = runtime.reload;
    await reset();
    // The reset writes active_config; wait for the change stream to deliver that write, then clear it.
    for (let t = 0; runtime.watching && runtime.reload === before && t < 2000; t += 50) await new Promise((r) => setTimeout(r, 50));
    runtime.reload = null;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    runtime.running = null;
  }
}
