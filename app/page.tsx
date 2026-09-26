import { readFile } from "node:fs/promises";
import path from "node:path";
import Console from "@/app/components/Console";
import type { ConsoleState } from "@/lib/state";

const FIXTURES = ["reset", "order-1", "order-2", "grant", "refund-1", "order-n"];

// `/?fixture=order-1` renders a saved state from fixtures/state; plain `/` polls the engine.
export default async function Page({ searchParams }: PageProps<"/">) {
  const { fixture } = await searchParams;
  if (typeof fixture !== "string" || !FIXTURES.includes(fixture)) return <Console />;
  const file = path.join(process.cwd(), "fixtures/state", `${fixture}.json`);
  const state = JSON.parse(await readFile(file, "utf8")) as ConsoleState;
  return <Console key={fixture} fixture={fixture} initial={state} />;
}
