// npm run eval [tool…] — v1 plus any granted tools, against the current case suite.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { evaluate } = await import("../lib/engine/harness");
const { flushTraces } = await import("../lib/engine/trace");
const { db } = await import("../lib/engine/db");
const { BASELINE } = await import("../lib/engine/policy");
const grants = process.argv.slice(2);
const policy = { ...BASELINE, tools: { ...BASELINE.tools, enabled: [...BASELINE.tools.enabled, ...grants] } };
const ev = await evaluate(await db(), policy, `v1${grants.map((g) => ` + ${g}`).join("")}`);
for (const c of ev.cases) console.log(c.outcome.padEnd(10), c.caseId.padEnd(22), c.result);
console.log(`${ev.pass}/${ev.cases.length}`);
await flushTraces();
process.exit(0);
