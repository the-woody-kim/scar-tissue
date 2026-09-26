// npm run beat <beat> [pick] — one beat from the CLI, same code path as the page's button.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { runBeat } = await import("../lib/engine/harness");
const { flushTraces } = await import("../lib/engine/trace");
const [beat, pick] = process.argv.slice(2);
const t = Date.now();
await runBeat(beat, pick as never);
console.log(`${beat} in ${((Date.now() - t) / 1000).toFixed(1)} s`);
await flushTraces();
process.exit(0);
