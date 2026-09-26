import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { reset } = await import("../lib/engine/harness");
const { acquire, holder, release } = await import("../lib/engine/lock");
// Take the same lock as the page's Reset demo, so a running beat isn't wiped mid-run and the page
// shows "Resetting" instead of failing its polls.
const token = await acquire("reset");
if (!token) {
  console.error(`busy: ${(await holder()) ?? "another run"}`);
  process.exit(1);
}
const t = Date.now();
try {
  await reset();
} finally {
  await release(token);
}
console.log(`reset in ${Date.now() - t} ms`);
process.exit(0);
