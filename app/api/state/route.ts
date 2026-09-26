import { holder } from "@/lib/engine/lock";
import { consoleState } from "@/lib/engine/state";

export const dynamic = "force-dynamic";

// While a reset holds the lock its collections are being dropped and reseeded, so there is no
// consistent state to read. Say so with a 202; the page keeps what it has until the reset lets go.
const resetting = () => Response.json({ running: "reset" }, { status: 202 });

export async function GET() {
  try {
    const state = await consoleState();
    return state.running === "reset" ? resetting() : Response.json(state);
  } catch (e) {
    if ((await holder().catch(() => null)) === "reset") return resetting();
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
