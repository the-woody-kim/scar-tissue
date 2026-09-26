import { consoleState } from "@/lib/engine/state";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await consoleState());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
