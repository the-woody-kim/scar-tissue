// npm run bench [reps] — does the harness the agent rewrote make the live agent better? The same
// executor model runs a held-out set of tasks × faults twice: under the baseline policy, and under the
// v4 the loop learns from a wiped database. Scored by the evaluator's fixed judge; two LangSmith
// experiments on one dataset, side by side in its compare view.
//
//   npm run bench 3
import nextEnv from "@next/env";
import { execSync } from "node:child_process";
nextEnv.loadEnvConfig(process.cwd());

process.env.LLM_SEED ||= "7";
process.env.OPENROUTER_PROVIDER ||= "openai";
process.env.LANGSMITH_TRACING = "true";

const { evaluate } = await import("langsmith/evaluation");
const { runBeat, reset, runCase, planFor } = await import("../lib/engine/harness");
type CaseDef = import("../lib/engine/harness").CaseDef;
type Pick = import("../lib/engine/harness").Pick;
type Task = import("../lib/engine/run").Task;
const { CATALOG } = await import("../lib/engine/run");
const { BASELINE, Policy, hash } = await import("../lib/engine/policy");
const { models } = await import("../lib/engine/llm");
const { db } = await import("../lib/engine/db");
const { tracer, flushTraces } = await import("../lib/engine/trace");

const reps = Number(process.argv[2] || 3);
const DATASET = "scar-tissue · held-out";
const commit = execSync("git rev-parse --short HEAD").toString().trim();

// ── Held-out cases: customers, items, amounts and pairings the eval suite never uses ──

const who = {
  dana: { id: "c_4410", name: "Dana Okafor" },
  leo: { id: "c_5023", name: "Leo Marsh" },
  mei: { id: "c_6187", name: "Mei Tanaka" },
  sam: { id: "c_7302", name: "Sam Ortiz" },
  ravi: { id: "c_8841", name: "Ravi Patel" },
};
type Who = keyof typeof who;
const ORDER_TOOLS = ["find_orders", "create_order"];
const REFUND_TOOLS = ["find_orders", "issue_refund"];

function order(id: string, c: Who, items: [string, number][], pick: Pick, effects = items.length): CaseDef {
  const tasks: Task[] = items.map(([sku, qty]) => ({ kind: "place_order", customer: who[c], sku, qty }));
  return {
    _id: id, origin: "seed", tools: ORDER_TOOLS, about: `${pick}`, setup: [], tasks,
    faults: planFor(pick, "create_order"), expect: { effects, accept: pick === "after_commit_lookup_down" ? ["done", "escalated"] : ["done"] },
    sourceIncidentId: null,
  };
}

function refund(id: string, c: Who, bought: [string, number], orderId: string, refunds: [number, string][], pick: Pick): CaseDef {
  const tasks: Task[] = refunds.map(([amountCents, reason]) => ({
    kind: "refund", customer: who[c], orderId, amountCents, reason, detail: `a refund on order ${orderId}.`,
  }));
  return {
    _id: id, origin: "seed", tools: REFUND_TOOLS, about: `${pick}`,
    setup: [{ orderId, customerId: who[c].id, sku: bought[0], qty: bought[1] }], tasks,
    faults: planFor(pick, "issue_refund"), expect: { effects: refunds.length, accept: pick === "after_commit_lookup_down" ? ["done", "escalated"] : ["done"] },
    sourceIncidentId: null,
  };
}

const CASES: CaseDef[] = [
  order("h.order.dana.none", "dana", [["EGG-12", 3]], "none"),
  order("h.order.leo.before", "leo", [["COF-500", 1]], "before_commit"),
  order("h.order.sam.after", "sam", [["SRD-800", 2]], "after_commit"),
  order("h.order.dana.after", "dana", [["GRK-YOG", 1]], "after_commit"),
  order("h.order.ravi.after+lookup", "ravi", [["OAT-1L", 4]], "after_commit_lookup_down"),
  order("h.order.mei.two_items.after", "mei", [["BAN-6", 2], ["OAT-1L", 1]], "after_commit"),
  refund("h.refund.leo.none", "leo", ["COF-500", 1], "o_H1", [[500, "damaged"]], "none"),
  refund("h.refund.sam.before", "sam", ["SRD-800", 2], "o_H2", [[650, "stale"]], "before_commit"),
  refund("h.refund.mei.after", "mei", ["BAN-6", 2], "o_H3", [[299, "missing"]], "after_commit"),
  refund("h.refund.dana.after+lookup", "dana", ["EGG-12", 3], "o_H4", [[520, "cracked"]], "after_commit_lookup_down"),
  refund("h.refund.ravi.two_partials.after", "ravi", ["OAT-1L", 4], "o_H5", [[449, "damaged"], [449, "missing"]], "after_commit"),
];
for (const c of CASES) for (const t of c.tasks) if (t.kind === "place_order" && !CATALOG[t.sku]) throw new Error(`unknown sku ${t.sku}`);

if (!(await tracer.hasDataset({ datasetName: DATASET }))) {
  const ds = await tracer.createDataset(DATASET, { description: "Held-out tasks × faults, run live under a policy and scored by the evaluator's fixed judge." });
  for (const c of CASES) {
    await tracer.createExample({ dataset_id: ds.id, inputs: { case: c }, outputs: { effects: c.expect.effects, accept: c.expect.accept } });
  }
}

// ── The two arms. Nothing here writes a policy: v4 is read after the loop learns it. ──

await reset();
for (const beat of ["order-1", "order-2", "grant-issue_refund", "refund-1"]) {
  console.log(`learning: ${beat}`);
  await runBeat(beat);
}
const d = await db();
const learned = await d.collection("policies").findOne({ version: 4 });
if (!learned) throw new Error("the loop didn't reach v4 — no benchmark");
const v4 = Policy.parse(learned.policy);
const baseline = { ...BASELINE, tools: { ...BASELINE.tools, enabled: [...BASELINE.tools.enabled, "issue_refund"] } };

type O = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const target = (policy: typeof v4) => async ({ case: c }: { case: CaseDef }) => {
  const id = `b_${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;
  const r = await runCase(d, policy, c, id, true);
  const [effects] = r.result.split(" ");
  return { outcome: r.outcome, result: r.result, effects: Number(effects), reports: r.result.split(" · ")[1] ?? "" };
};

const score = (key: string, pass: boolean, comment?: string) => ({ key, score: pass ? 1 : 0, comment });
const evaluators = [
  ({ outputs: o }: { outputs: O }) => score("correct", o.outcome === "pass", o.result),
  ({ outputs: o, referenceOutputs: r }: { outputs: O; referenceOutputs?: O }) => score("no_duplicate", !(o.effects > (r?.effects ?? 1)), `${o.effects} made, ${r?.effects} expected`),
  ({ outputs: o }: { outputs: O }) => score("not_uncertain", o.outcome !== "uncertain", o.outcome),
];
const summary = ({ outputs, referenceOutputs }: { outputs: O[]; referenceOutputs?: O[] }) => ({
  results: [
    { key: "correct_rate", score: outputs.filter((o) => o.outcome === "pass").length / outputs.length },
    { key: "duplicate_rate", score: outputs.filter((o, i) => o.effects > (referenceOutputs?.[i]?.effects ?? 1)).length / outputs.length },
  ],
});

const executor = models.executor();
console.log(`bench: ${CASES.length} cases × ${reps} reps × 2 arms · executor ${executor} · seed ${process.env.LLM_SEED} · ${commit}`);
const arms: [string, typeof v4][] = [["baseline", baseline], ["learned-v4", v4]];
const done: { arm: string; name: string; rows: { id: string; o: O }[]; summary: [string, number][] }[] = [];
for (const [arm, policy] of arms) {
  const res = await evaluate(target(policy), {
    data: DATASET,
    evaluators,
    summaryEvaluators: [summary],
    numRepetitions: reps,
    maxConcurrency: 4, // every case runs in its own scope
    experimentPrefix: `bench-${arm}`,
    description: `Held-out tasks × faults, live executor, under the ${arm} policy.`,
    metadata: { arm, policyHash: hash(policy), executor, seed: process.env.LLM_SEED, provider: process.env.OPENROUTER_PROVIDER, commit },
    client: tracer,
  });
  done.push({
    arm, name: res.experimentName,
    rows: res.results.map((row) => ({ id: (row.example.inputs as { case: CaseDef }).case._id, o: row.run.outputs as O })),
    summary: res.summaryResults.results.map((r) => [r.key, Number(r.score)]),
  });
}

// ── Report ──
const ids = CASES.map((c) => c._id);
console.log(`\n${"case".padEnd(34)}${done.map((a) => a.arm.padEnd(26)).join("")}`);
for (const id of ids) {
  const cells = done.map((a) => {
    const rs = a.rows.filter((r) => r.id === id);
    const ok = rs.filter((r) => r.o.outcome === "pass").length;
    return `${ok}/${rs.length} · ${[...new Set(rs.map((r) => r.o.result))].join(" | ")}`.slice(0, 25).padEnd(26);
  });
  console.log(`${id.padEnd(34)}${cells.join("")}`);
}
for (const a of done) console.log(`${a.arm}: ${a.summary.map(([k, v]) => `${k}=${v.toFixed(2)}`).join(" ")} · ${a.name}`);
const ds = await tracer.readDataset({ datasetName: DATASET });
const sessions = await Promise.all(done.map((a) => tracer.readProject({ projectName: a.name })));
console.log(`compare: ${await tracer.getDatasetUrl({ datasetId: ds.id })}/compare?selectedSessions=${sessions.map((s) => s.id).join(",")}`);

await reset();
await flushTraces();
process.exit(0);
