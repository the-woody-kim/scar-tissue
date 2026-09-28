import { readFile } from "node:fs/promises";
import path from "node:path";
import Console from "@/app/components/Console";
import { demoOnly } from "@/lib/engine/demo";
import type { ConsoleState } from "@/lib/state";

const FIXTURES = ["reset", "order-1", "order-2", "grant", "refund-1", "order-n"];

// `/?fixture=order-1` renders a saved state from fixtures/state; plain `/` polls the engine.
// With no model key (the public deploy) there is no engine, so `/` opens the saved demo instead.
export default async function Page({ searchParams }: PageProps<"/">) {
  const { fixture: asked } = await searchParams;
  const fixture = typeof asked === "string" && FIXTURES.includes(asked) ? asked : demoOnly() ? "reset" : null;
  if (!fixture) return <Console />;
  const file = path.join(process.cwd(), "fixtures/state", `${fixture}.json`);
  const state = JSON.parse(await readFile(file, "utf8")) as ConsoleState;
  return <Console key={fixture} fixture={fixture} initial={state} />;
}
