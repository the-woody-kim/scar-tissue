// npm run experiment [reps] — the whole recursive loop, N times from a wiped database, as a LangSmith
// experiment. Each repetition: reset → order-1 → order-2 → grant issue_refund → refund-1. Scored by
// code, not a model. Pins one model, a seed and one provider so repetitions differ as little as possible.
//
//   EXPERIMENT_MODEL=openai/gpt-6-astra npm run experiment 5
import nextEnv from "@next/env";
import { execSync } from "node:child_process";
nextEnv.loadEnvConfig(process.cwd());

const MODEL = process.env.EXPERIMENT_MODEL || "openai/gpt-6-astra";
process.env.OPENROUTER_EXECUTOR_MODEL = MODEL;
process.env.OPENROUTER_PROPOSER_MODEL = MODEL;
process.env.LLM_SEED ||= "7";
process.env.OPENROUTER_PROVIDER ||= "openai";
process.env.LANGSMITH_TRACING = "true";

const { evaluate } = await import("langsmith/evaluation");
const { runBeat, reset } = await import("../lib/engine/harness");
const { db } = await import("../lib/engine/db");
const { tracer, flushTraces } = await import("../lib/engine/trace");

const reps = Number(process.argv[2] || 5);
const DATASET = "scar-tissue · four beats";
const BEATS = ["order-1", "order-2", "grant-issue_refund", "refund-1"];

if (!(await tracer.hasDataset({ datasetName: DATASET }))) {
  const ds = await tracer.createDataset(DATASET, { description: "Reset, then the four demo beats with the timeout-after-saving fault." });
  await tracer.createExample({
    dataset_id: ds.id,
    inputs: { beats: BEATS, fault: "after_commit" },
    outputs: { order1: 2, promotedAfterOrder1: 2, order2: 1, promotedAfterGrant: 4, refund1: 1 },
  });
}

type Cand = { letter: string; name: string; section: string; status: string; promotedTo?: number; failed?: { caseId: string } };

async function fourBeats() {
  await reset();
  const d = await db();
  const out: Record<string, unknown> = {};
  const lastRun = () => d.collection("runs").find({ scope: "live" }).sort({ startedAt: -1 }).limit(1).next();
  const lastLearning = () => d.collection("learning").find().sort({ createdAt: -1 }).limit(1).next();
  const learned = (l: Record<string, unknown> | null) => l && {
    before: l.before, promoted: l.promoted,
    candidates: (l.candidates as Cand[]).map((c) => ({ letter: c.letter, name: c.name, section: c.section, status: c.status, failed: c.failed?.caseId ?? null })),
  };
  const active = async () => {
    const a = await d.collection("active_config").findOne({ _id: "active" as never });
    return { version: a?.version, hash: String(a?.hash ?? "").slice(0, 6) };
  };
  const run = async (beat: string) => {
    const t = Date.now();
    await runBeat(beat);
    return Date.now() - t;
  };

  out.order1Ms = await run("order-1");
  const r1 = await lastRun();
  out.order1 = r1?.check.effects;
  out.afterOrder1 = { ...(await active()), learning: learned(await lastLearning()) };

  out.order2Ms = await run("order-2");
  const r2 = await lastRun();
  out.order2 = r2?.check.effects;
  out.order2Adopted = (r2?.steps as { result?: { kind: string } }[]).some((s) => s.result?.kind === "adopted");

  out.grantMs = await run("grant-issue_refund");
  out.afterGrant = { ...(await active()), learning: learned(await lastLearning()) };

  out.refund1Ms = await run("refund-1");
  const r4 = await lastRun();
  out.refund1 = r4?.check.effects;
  out.refund1Adopted = (r4?.steps as { result?: { kind: string } }[]).some((s) => s.result?.kind === "adopted");
  return out;
}

type O = Record<string, any>;
const score = (key: string, pass: boolean, comment?: string) => ({ key, score: pass ? 1 : 0, comment });
const rejectedNamed = (l: O | null) => (l?.candidates ?? []).some((c: O) => c.status === "rejected" && c.failed);

const evaluators = [
  ({ outputs: o }: { outputs: O }) => score("order1_duplicates", o.order1 === 2, `${o.order1} orders under v1`),
  ({ outputs: o }: { outputs: O }) => score("v2_promoted", o.afterOrder1?.version === 2, `active v${o.afterOrder1?.version}`),
  ({ outputs: o }: { outputs: O }) => score("rejection_names_case", rejectedNamed(o.afterOrder1?.learning), (o.afterOrder1?.learning?.candidates ?? []).map((c: O) => `${c.letter} ${c.status}${c.failed ? ` (${c.failed})` : ""}`).join(" · ")),
  ({ outputs: o }: { outputs: O }) => score("order2_single", o.order2 === 1 && o.order2Adopted, `${o.order2} order${o.order2Adopted ? ", adopted" : ""}`),
  ({ outputs: o }: { outputs: O }) => score("v4_before_refund", o.afterGrant?.version === 4, `active v${o.afterGrant?.version}`),
  ({ outputs: o }: { outputs: O }) => score("refund1_single", o.refund1 === 1, `${o.refund1} refund${o.refund1Adopted ? ", adopted" : ""}`),
];

// Across repetitions: how often the whole loop worked, and how repeatable the learned policies were.
const summary = ({ outputs }: { outputs: O[] }) => {
  const full = outputs.filter((o) => o.order1 === 2 && o.afterOrder1?.version === 2 && o.order2 === 1 && o.afterGrant?.version === 4 && o.refund1 === 1).length;
  const distinct = (f: (o: O) => unknown) => new Set(outputs.map((o) => JSON.stringify(f(o)))).size;
  return {
    results: [
      { key: "loop_complete_rate", score: full / outputs.length },
      { key: "distinct_v2_hashes", score: distinct((o) => o.afterOrder1?.hash) },
      { key: "distinct_v4_hashes", score: distinct((o) => o.afterGrant?.hash) },
      { key: "distinct_order1_candidate_sets", score: distinct((o) => o.afterOrder1?.learning?.candidates?.map((c: O) => [c.section, c.status])) },
    ],
  };
};

const commit = execSync("git rev-parse --short HEAD").toString().trim();
console.log(`experiment: ${reps} × four beats · model ${MODEL} · seed ${process.env.LLM_SEED} · provider ${process.env.OPENROUTER_PROVIDER} · ${commit}`);
const results = await evaluate(fourBeats, {
  data: DATASET,
  evaluators,
  summaryEvaluators: [summary],
  numRepetitions: reps,
  maxConcurrency: 1, // one shared database: repetitions must not overlap
  experimentPrefix: `recursive-${MODEL.split("/").pop()}`,
  description: "Reset, then order-1 → order-2 → grant issue_refund → refund-1, scored by fixed checks.",
  metadata: { model: MODEL, seed: process.env.LLM_SEED, provider: process.env.OPENROUTER_PROVIDER, commit },
  client: tracer,
});

for (const [i, row] of results.results.entries()) {
  const o = row.run.outputs as O;
  const s = row.evaluationResults.results.map((r) => `${r.key}=${r.score}`).join(" ");
  console.log(`#${i + 1} v2 ${o.afterOrder1?.hash} · v4 ${o.afterGrant?.hash} · ${s}`);
  for (const [label, l] of [["order-1", o.afterOrder1?.learning], ["grant", o.afterGrant?.learning]] as const) {
    console.log(`   ${label}: before ${l?.before?.pass}/${l?.before?.total} · ${(l?.candidates ?? []).map((c: O) => `${c.letter}:${c.section}:${c.status}${c.failed ? `(${c.failed})` : ""}`).join("  ")}`);
  }
  console.log(`   ms: order1 ${o.order1Ms} · order2 ${o.order2Ms} · grant ${o.grantMs} · refund1 ${o.refund1Ms}`);
}
console.log("summary:", JSON.stringify(results.summaryResults.results.map((r) => [r.key, r.score])));
console.log("experiment:", results.experimentName);
await flushTraces();
process.exit(0);
