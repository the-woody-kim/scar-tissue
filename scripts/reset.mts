import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { reset } = await import("../lib/engine/harness");
const t = Date.now();
await reset();
console.log(`reset in ${Date.now() - t} ms`);
process.exit(0);
