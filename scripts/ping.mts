import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const { llm, models } = await import("../lib/engine/llm");
const { db } = await import("../lib/engine/db");
for (const role of ["executor", "proposer"] as const) {
  const t = Date.now();
  try {
    const r = await llm().chat.completions.create({ model: models[role](), temperature: 0, messages: [{ role: "user", content: "Reply with the word ok." }] });
    console.log(role, models[role](), "→", r.choices[0].message.content, Date.now() - t, "ms", r.model);
  } catch (e) { console.log(role, models[role](), "FAILED", (e as Error).message); }
}
const d = await db();
console.log("atlas collections:", (await d.listCollections().toArray()).map((c) => c.name).join(", ") || "(none)");
process.exit(0);
