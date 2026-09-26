import type { Db } from "mongodb";
import type OpenAI from "openai";
import { z } from "zod";
import type { CandidateView, Outcome, StepView } from "@/lib/state";
import { db } from "./db";
import { chat, models } from "./llm";
import { BASELINE, Change, Policy, apply, diffLines, hash } from "./policy";
import { CATALOG, Run, execute, taskText, type FaultPlanEntry, type Report, type Task } from "./run";
import { span } from "./trace";

// ── Cases ───────────────────────────────────────────────────────────────────

export interface CaseDef {
  _id: string;
  origin: "seed" | "incident" | "transfer";
  tools: string[];
  about: string;
  setup: { orderId: string; customerId: string; sku: string; qty: number }[];
  tasks: Task[];
  faults: FaultPlanEntry[];
  expect: { effects: number; accept: string[] };
  sourceIncidentId: string | null;
}

const EVAL_CUSTOMER = { id: "c_eval", name: "Eval Customer" };
const orderTask: Task = { kind: "place_order", customer: EVAL_CUSTOMER, sku: "BAN-6", qty: 2 };
const refundTask = (amountCents: number, reason: string): Task => ({
  kind: "refund", customer: EVAL_CUSTOMER, orderId: "o_EVAL", amountCents, reason, detail: `a refund on order o_EVAL.`,
});
const refundSetup = [{ orderId: "o_EVAL", customerId: "c_eval", sku: "GRK-YOG", qty: 3 }];
const lookupDown = (): FaultPlanEntry => ({ tool: "find_orders", afterTimeout: true, times: 2, fault: "lookup_error" });

const ORDER_TOOLS = ["find_orders", "create_order"];
const REFUND_TOOLS = ["find_orders", "issue_refund"];

export const SEED_CASES: CaseDef[] = [
  seed("order.happy", ORDER_TOOLS, "no fault", [], [orderTask], [], 1),
  seed("order.transient", ORDER_TOOLS, "times out before saving", [], [orderTask], [{ tool: "create_order", call: 1, fault: "timeout_before_commit" }], 1),
  seed("refund.happy", REFUND_TOOLS, "no fault", refundSetup, [refundTask(325, "damaged")], [], 1),
  seed("refund.partial_x2", REFUND_TOOLS, "two legitimate partial refunds", refundSetup, [refundTask(150, "damaged"), refundTask(175, "missing")], [], 2),
  seed("refund.transient", REFUND_TOOLS, "times out before saving", refundSetup, [refundTask(325, "damaged")], [{ tool: "issue_refund", call: 1, fault: "timeout_before_commit" }], 1),
];

function seed(id: string, tools: string[], about: string, setup: CaseDef["setup"], tasks: Task[], faults: FaultPlanEntry[], effects: number): CaseDef {
  return { _id: id, origin: "seed", tools, about, setup, tasks, faults, expect: { effects, accept: ["done"] }, sourceIncidentId: null };
}

// An incident's pattern as cases on a tool: the pattern itself, and the same with lookups failing.
function derivedCases(tool: "create_order" | "issue_refund", origin: "incident" | "transfer", n: number, incidentId: string): CaseDef[] {
  const order = tool === "create_order";
  const base = `${order ? "order" : "refund"}.${origin === "incident" ? "inc" : "xfer"}${n}`;
  const common = {
    origin, tools: order ? ORDER_TOOLS : REFUND_TOOLS, setup: order ? [] : refundSetup,
    tasks: [order ? orderTask : refundTask(325, "damaged")], sourceIncidentId: incidentId,
  };
  const fault: FaultPlanEntry = { tool, call: 1, fault: "timeout_after_commit" };
  return [
    { ...common, _id: base, about: origin === "incident" ? "times out after saving" : `incident #${n}'s pattern on ${tool}`, faults: [fault], expect: { effects: 1, accept: ["done"] } },
    { ...common, _id: `${base}+lookup`, about: origin === "incident" ? "after saving, then 2 lookups fail" : "the same, with 2 lookups failing", faults: [fault, lookupDown()], expect: { effects: 1, accept: ["done", "escalated"] } },
  ];
}

// ── Evaluator (fixed) ───────────────────────────────────────────────────────

export interface CaseResult { caseId: string; outcome: Outcome; result: string }

function judge(effects: number, expected: number, reports: Report[], accept: string[]): Outcome {
  if (reports.some((r) => r.status === null)) return "uncertain";
  const last = reports[reports.length - 1];
  const agrees = last.status === "done" ? effects === expected : last.status === "failed" ? effects === 0 : effects <= expected;
  return effects === expected && agrees && reports.every((r) => r.status && accept.includes(r.status)) ? "pass" : "fail";
}

async function runCase(d: Db, policy: Policy, c: CaseDef, evalRunId: string): Promise<CaseResult> {
  const scope = `${evalRunId}/${c._id}`;
  const expiresAt = new Date(Date.now() + 3600_000);
  try {
    if (c.setup.length) {
      await d.collection("orders").insertMany(c.setup.map((o) => ({
        orderId: o.orderId, scope, runId: "setup", customerId: o.customerId, sku: o.sku, qty: o.qty,
        amountCents: CATALOG[o.sku].cents * o.qty, refunds: [], createdAt: new Date(0), expiresAt,
      })) as never[]);
    }
    const reports: Report[] = [];
    const runIds: string[] = [];
    for (const [i, task] of c.tasks.entries()) {
      const runId = `${scope}#${i}`;
      runIds.push(runId);
      const run = new Run({ db: d, scope, runId, policy, plan: i === 0 ? c.faults : [], timeoutMs: 150, expiresAt, scripted: true });
      reports.push(await withTimeout(execute(run, policy, task), 240_000));
    }
    const effects = await countEffects(d, scope, runIds, c.tasks[0].kind);
    const outcome = judge(effects, c.expect.effects, reports, c.expect.accept);
    const noun = c.tasks[0].kind === "place_order" ? "order" : "refund";
    return { caseId: c._id, outcome, result: `${effects} ${noun}${effects === 1 ? "" : "s"} · ${reports.map((r) => r.status ?? "no report").join(", ")}` };
  } catch (e) {
    return { caseId: c._id, outcome: "uncertain", result: (e as Error).message.slice(0, 80) };
  }
}

async function countEffects(d: Db, scope: string, runIds: string[], kind: Task["kind"]) {
  if (kind === "place_order") return d.collection("orders").countDocuments({ scope, runId: { $in: runIds } });
  const docs = await d.collection("orders").find({ scope }).toArray();
  return docs.flatMap((o) => o.refunds ?? []).filter((r: { runId: string }) => runIds.includes(r.runId)).length;
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("case timeout")), ms))]);

async function suiteFor(d: Db, policy: Policy): Promise<CaseDef[]> {
  const all = await d.collection<CaseDef>("eval_cases").find().sort({ order: 1 }).toArray();
  return all.filter((c) => c.tools.every((t) => policy.tools.enabled.includes(t)));
}

export const evaluate = span("evaluate", evaluateSuite, (_d, policy, label) => ({ label, policyHash: hash(policy) }), (ev) => ({ pass: ev.pass, fail: ev.fail, uncertain: ev.uncertain, cases: ev.cases }));

async function evaluateSuite(d: Db, policy: Policy, label: string) {
  const cases = await suiteFor(d, policy);
  const evalRunId = `e_${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 36).toString(36)}`;
  const limit = Number(process.env.EVAL_CONCURRENCY || 4);
  const results: CaseResult[] = new Array(cases.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, cases.length) }, async () => {
    while (next < cases.length) {
      const i = next++;
      results[i] = await runCase(d, policy, cases[i], evalRunId);
    }
  }));
  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  const doc = { _id: evalRunId, policyHash: hash(policy), label, cases: results, pass: count("pass"), fail: count("fail"), uncertain: count("uncertain"), startedAt: new Date() };
  await d.collection("eval_runs").insertOne(doc as never);
  return doc;
}

// ── Learning: incident → cases → recall → propose → screen → eval → promote ──

const Proposal = z.object({ candidates: z.array(z.object({ name: z.string().transform((s) => s.slice(0, 40)), change: z.unknown() })).min(1).max(4) });

const DSL = `A policy has four sections. A candidate is exactly ONE change, as JSON "change":
- {"section":"rules","rule":{"tool":"<tool or *>","on":"timeout","action":"retry"|"no_retry","max":0-3}}  (added first, so it overrides "*")
- {"section":"guardrails","guardrail":{"kind":"verify_before_retry","tool":"<mutating tool>","lookup":{"tool":"find_orders","args":{"customerId":"$args.customerId"} or {"orderId":"$args.orderId"},"path":"orders" or "orders.*.refunds","match":["<field>",...],"withinSeconds":1-3600},"onFound":"adopt","onLookupError":{"recheck":0-3,"then":"halt"|"proceed"}}}
  Before any retry of the tool, look the record up; if one matching the call's own argument values exists, adopt it instead of retrying.
  Order fields: sku, qty. Refund fields: amountCents, reason.
- {"section":"context","tool":"<tool>","note":"<=200 chars, shown to the agent"}
- {"section":"tools","tool":"issue_refund","maxPerOrder":<n>}`;

const propose = span("propose", proposeCandidates, (parent, brief, recall, cases) => ({ parentHash: hash(parent), brief, recall, cases: cases.map((c) => c._id) }), (out) => ({ candidates: out }));

async function proposeCandidates(parent: Policy, brief: string, recall: string, cases: CaseDef[]) {
  const prompt = [
    "You improve the harness around an LLM agent that takes actions on a store's orders. You may only propose typed policy changes.",
    DSL,
    `Current policy:\n${JSON.stringify(parent)}`,
    brief,
    `Test cases every candidate must pass:\n${cases.map((c) => `- ${c._id}: ${c.about}`).join("\n")}`,
    `Memory — similar past incidents and the fixes tried:\n${recall}`,
    'Propose EXACTLY 3 candidates, ordered from most conservative to most targeted. Each candidate must change a DIFFERENT section (for example one rule, one guardrail, one context note), so the evaluator compares genuinely different ideas. Name each in 2–5 plain words. Reply with JSON only: {"candidates":[{"name":"<short name>","change":{...}}]}',
  ].join("\n\n");
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: "user", content: prompt }];
  let out: z.infer<typeof Proposal>["candidates"] = [];
  // A single candidate leaves the evaluator nothing to compare, so ask once more.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await chat({ model: models.proposer(), temperature: 0, response_format: { type: "json_object" }, messages });
    const content = res.choices[0].message.content || "{}";
    out = Proposal.parse(JSON.parse(content)).candidates;
    const valid = out.filter((c) => Change.safeParse(c.change).success).length;
    console.log(`[proposer] attempt ${attempt + 1}: ${out.length} candidates (${valid} valid): ${out.map((c) => c.name).join(" | ")}`);
    if (valid >= 2) break;
    messages.push({ role: "assistant", content }, { role: "user", content: `That is ${valid} valid candidate(s). Reply with exactly 3, each a valid change to a different section, in the same JSON shape.` });
  }
  return out;
}

function leaks(change: unknown, literals: string[]): string[] {
  const text = JSON.stringify(change).toLowerCase();
  return literals.filter((l) => l && text.includes(l.toLowerCase()));
}

interface LearnInput {
  kind: "incident" | "grant";
  parent: { version: number; policy: Policy };
  triggerIncidentIds: string[];
  newCases: CaseDef[];
  brief: string;
  literals: string[];
  incident?: { n: number; summary: string };
  tool?: string;
  query: { label: string; text: string; title: string };
}

const learn = span("learn", learnFrom, (_d, input) => ({ kind: input.kind, parent: `v${input.parent.version}`, triggers: input.triggerIncidentIds, newCases: input.newCases.map((c) => c._id) }));

async function learnFrom(d: Db, input: LearnInput) {
  const { parent } = input;
  await d.collection("eval_cases").insertMany(input.newCases.map((c, i) => ({ ...c, order: Date.now() + i })) as never[]);
  const suite = await suiteFor(d, parent.policy);
  const before = await evaluate(d, parent.policy, `v${parent.version}`);
  const recall = await recallFor(d, input.tool ?? "create_order");
  const recallText = recall.map((h) => `- [${h.origin}] ${h.tool}: ${h.summary}${h.attempts.map((a) => `\n    ${a.status}: ${a.name} (${a.detail})`).join("")}`).join("\n");

  let proposals: { name: string; change: unknown }[] = [];
  for (let attempt = 0; attempt < 3 && proposals.length < 2; attempt++) {
    try {
      proposals = await propose(parent.policy, input.brief, recallText, suite);
    } catch (e) {
      console.error("proposer failed", e);
    }
  }
  const letters = "ABCD";
  const evaluated = [];
  for (const [i, p] of proposals.entries()) evaluated.push(await (async () => {
    const parsed = Change.safeParse(p.change);
    const base = { letter: letters[i], name: p.name };
    if (!parsed.success) return { ...base, section: "rules" as const, status: "rejected" as const, diff: ["(invalid change)"], cases: [], failed: { caseId: "schema", detail: "not a valid policy change — uncertain" }, policy: null, change: null, evalRunId: null, pass: 0, fail: 0, uncertain: 0 };
    const change = parsed.data;
    const diff = diffLines(parent.policy, change);
    const named = leaks(change, input.literals);
    if (named.length) return { ...base, section: change.section, status: "screened" as const, diff, cases: [], screened: named, policy: null, change, evalRunId: null, pass: 0, fail: 0, uncertain: 0 };
    let policy: Policy;
    try {
      policy = apply(parent.policy, change);
    } catch {
      return { ...base, section: change.section, status: "rejected" as const, diff, cases: [], failed: { caseId: "schema", detail: "invalid policy" }, policy: null, change, evalRunId: null, pass: 0, fail: 0, uncertain: 0 };
    }
    const ev = await evaluate(d, policy, `candidate ${letters[i]}`);
    return { ...base, section: change.section, status: "rejected" as const, diff, cases: ev.cases, policy, change, evalRunId: ev._id, pass: ev.pass, fail: ev.fail, uncertain: ev.uncertain };
  })());

  // Promote: every case passes, beats the parent, smallest diff wins.
  const winners = evaluated.filter((c) => c.policy && c.fail === 0 && c.uncertain === 0 && (c.pass ?? 0) > before.pass);
  winners.sort((a, b) => JSON.stringify(a.change).length - JSON.stringify(b.change).length);
  const winner = winners[0];
  const version = parent.version + 1;
  for (const c of evaluated) {
    const failed = c.cases.filter((r) => r.outcome !== "pass");
    await d.collection("policies").insertOne({
      _id: c === winner ? (`p_${version}` as never) : (`p_${version}_${c.letter}_${Date.now().toString(36)}` as never), version: c === winner ? version : null, hash: c.policy ? hash(c.policy) : null,
      parent: parent.version, status: c === winner ? "active" : "rejected", origin: input.kind === "grant" ? "transfer" : "learned",
      trigger: { kind: input.kind === "grant" ? "tool_grant" : "incident", incidentIds: input.triggerIncidentIds },
      name: c.name, change: c.change, diff: c.diff, policy: c.policy, evalRunId: c.evalRunId,
      result: { pass: c.pass ?? 0, fail: c.fail ?? 0, uncertain: c.uncertain ?? 0, failedCases: failed.map((f) => f.caseId), screened: "screened" in c ? c.screened : [] },
      createdAt: new Date(),
    });
    if (c === winner) c.status = "promoted" as never;
  }
  if (winner?.policy) {
    await d.collection("policies").updateMany({ status: "active", _id: { $ne: `p_${version}` as never } }, { $set: { status: "superseded" } });
    await d.collection("active_config").updateOne({ _id: "active" as never }, { $set: { version, hash: hash(winner.policy), evalRunId: winner.evalRunId, promotedAt: new Date() } }, { upsert: true });
  }

  const candidates: CandidateView[] = evaluated.map((c) => {
    const firstFail = c.cases.find((r) => r.outcome !== "pass");
    return {
      letter: c.letter, name: c.name, section: c.section, status: c.status, ...(c === winner ? { promotedTo: version } : {}),
      diff: c.diff, cases: c.cases.map((r) => ({ id: r.caseId, outcome: r.outcome })),
      ...(c.status === "screened" ? { screened: (c as { screened?: string[] }).screened } : {}),
      ...(c.status === "rejected" && firstFail ? { failed: { caseId: firstFail.caseId, detail: firstFail.result } } : {}),
      ...(c.status === "rejected" && !firstFail && "failed" in c && c.failed ? { failed: c.failed } : {}),
      ...(c.status === "rejected" && !firstFail && c.policy ? { failed: { caseId: "no gain", detail: "passes, but no better than the active version" } } : {}),
    };
  });
  await d.collection("learning").insertOne({
    kind: input.kind, incident: input.incident ?? null, tool: input.tool ?? null, fromVersion: parent.version,
    before: { version: parent.version, pass: before.pass, total: before.cases.length },
    newCases: input.newCases.map((c) => c._id), candidates, promoted: winner ? version : null,
    recall: { title: input.query.title, label: input.query.label, text: input.query.text, hits: recall.slice(0, 3) },
    createdAt: new Date(),
  });
}

// Memory: incidents with the fixes each one produced — promoted, rejected and screened — in one aggregation.
export async function recallFor(d: Db, tool: string) {
  const rows = await d.collection("incidents").aggregate([
    { $match: { toolKind: "mutating" } },
    { $lookup: { from: "policies", localField: "_id", foreignField: "trigger.incidentIds", as: "attempts", pipeline: [{ $match: { "trigger.kind": "incident" } }, { $project: { name: 1, version: 1, status: 1, result: 1 } }] } },
    { $sort: { origin: 1, createdAt: 1 } },
  ]).toArray();
  const live = rows.filter((r) => r.origin === "live");
  const seed = rows.filter((r) => r.origin === "seed").sort((a, b) => overlap(b.summary, tool) - overlap(a.summary, tool));
  return [...live, ...seed].map((r) => ({
    origin: r.origin as "live" | "seed", tool: r.tool as string, incident: r.n as number | undefined, summary: r.summary as string,
    attempts: (r.attempts as { name: string; version: number | null; status: string; result: { pass: number; fail: number; failedCases: string[]; screened: string[] } }[]).map((a) => ({
      name: a.name, ...(a.version ? { version: a.version } : {}),
      status: (a.status === "rejected" && a.result.screened?.length ? "screened" : a.status === "rejected" ? "rejected" : "promoted") as "promoted" | "rejected" | "screened",
      detail: a.result.screened?.length ? "named the incident" : a.status === "rejected" ? (a.result.failedCases[0] ? `failed ${a.result.failedCases[0]}` : "no gain") : `${a.result.pass}/${a.result.pass + a.result.fail}`,
    })),
  }));
}

const overlap = (s: string, tool: string) => (/(retry|twice|timed out|second)/i.test(s) ? 2 : 0) + (s.includes(tool) ? 1 : 0);

// ── Live beats ──────────────────────────────────────────────────────────────

export const CUSTOMERS = [
  { id: "c_4410", name: "Dana Okafor", sku: "EGG-12", qty: 3 },
  { id: "c_5023", name: "Leo Marsh", sku: "COF-500", qty: 1 },
  { id: "c_6187", name: "Mei Tanaka", sku: "BAN-6", qty: 2 },
  { id: "c_7302", name: "Sam Ortiz", sku: "SRD-800", qty: 2 },
];

export type Pick = "after_commit" | "before_commit" | "after_commit_lookup_down" | "none";
export function planFor(pick: Pick, tool: string): FaultPlanEntry[] {
  if (pick === "none") return [];
  if (pick === "before_commit") return [{ tool, call: 1, fault: "timeout_before_commit" }];
  const plan: FaultPlanEntry[] = [{ tool, call: 1, fault: "timeout_after_commit" }];
  if (pick === "after_commit_lookup_down") plan.push(lookupDown());
  return plan;
}

export async function activePolicy(d: Db): Promise<{ version: number; policy: Policy }> {
  const a = await d.collection("active_config").findOne({ _id: "active" as never });
  const p = a && (await d.collection("policies").findOne({ version: a.version, hash: a.hash }));
  if (!p) throw new Error("No active policy — run reset");
  return { version: p.version, policy: Policy.parse(p.policy) };
}

export const runBeat = span("beat", playBeat, (beat, pick) => ({ beat, pick: pick ?? "after_commit" }));

async function playBeat(beat: string, pick?: Pick) {
  const d = await db();
  void (await import("./state")).watchActiveConfig();
  if (beat === "grant-issue_refund") return grant(d);
  const { version, policy } = await activePolicy(d);
  let task: Task;
  let title: string;
  const runs = d.collection("runs");
  if (beat === "refund-1") {
    task = { kind: "refund", customer: { id: "c_1180", name: "Priya Nair" }, orderId: "o_4H8M", amountCents: 325, reason: "damaged", detail: "1 of 3 Greek Yogurt arrived damaged — $3.25 on order o_4H8M." };
    title = `Refund #${(await runs.countDocuments({ "task.kind": "refund" })) + 1}`;
  } else {
    const n = await runs.countDocuments({ "task.kind": "place_order" });
    const fixed: Record<string, { id: string; name: string; sku: string; qty: number }> = {
      "order-1": { id: "c_2041", name: "Ana Ruiz", sku: "OAT-1L", qty: 2 },
      "order-2": { id: "c_3317", name: "Marcus Chen", sku: "SRD-800", qty: 1 },
    };
    const c = fixed[beat] ?? CUSTOMERS[(await runs.countDocuments({ beat: "order-n" })) % CUSTOMERS.length];
    task = { kind: "place_order", customer: { id: c.id, name: c.name }, sku: c.sku, qty: c.qty };
    title = `Order #${n + 1}`;
  }
  const tool = task.kind === "refund" ? "issue_refund" : "create_order";
  const plan = planFor(pick ?? "after_commit", tool);
  const runId = `r_${Date.now().toString(36)}`;
  const startedAt = new Date();
  const run = new Run({ db: d, scope: "live", runId, policy, plan, timeoutMs: 1500, expiresAt: null });
  const report = await execute(run, policy, task);
  const effects = await countEffects(d, "live", [runId], task.kind);
  const status = report.status ?? "failed";
  const agrees = status === "done" ? effects === 1 : status === "failed" ? effects === 0 : effects <= 1;
  const check = { noun: task.kind === "refund" ? "refund" : "order", effects, expected: 1, scope: "live", report: { status, agrees }, ok: effects === 1 && agrees && status === "done" };
  const detail = task.kind === "refund" ? task.detail : `${task.qty} × ${CATALOG[task.sku].name} (${task.sku}) at $${(CATALOG[task.sku].cents / 100).toFixed(2)}.`;
  await runs.insertOne({
    _id: runId as never, scope: "live", beat, title, startedAt, policyVersion: version, policyHash: hash(policy),
    task: { kind: task.kind, customer: task.customer, detail }, picked: pick && pick !== "after_commit" ? pick : null,
    steps: run.steps, report, check,
  });
  if (!check.ok) await onIncident(d, runId, task, run.steps, { version, policy }, effects);
}

async function onIncident(d: Db, runId: string, task: Task, steps: StepView[], parent: { version: number; policy: Policy }, effects: number) {
  const tool = task.kind === "refund" ? "issue_refund" : "create_order";
  const n = (await d.collection("incidents").countDocuments({ origin: "live" })) + 1;
  const noun = task.kind === "refund" ? "refund" : "order";
  const timedOut = steps.some((s) => s.tool === tool && s.result?.kind === "timeout");
  const summary = timedOut && effects > 1
    ? `${tool} timed out after the ${noun} was saved; the retry placed it again.`
    : `${tool}: ${effects} ${noun}s for one request.`;
  const incidentId = `inc_${n}`;
  await d.collection("incidents").insertOne({
    _id: incidentId as never, n, origin: "live", runId, tool, toolKind: "mutating",
    pattern: [{ tool, call: 1, fault: "timeout_after_commit" }], violations: [`${effects} ${noun}s for 1 request`], summary, createdAt: new Date(),
  });
  if (!(timedOut && effects > 1)) return;
  const trace = steps.map((s) => `${s.actor} ${s.tool}(${s.args.join(", ")}) → ${s.result?.kind ?? s.note ?? ""}${s.result?.ref ? " " + s.result.ref : ""}${s.clause ? " [" + s.clause + "]" : ""}`).join("\n");
  const literals = [task.customer.id, task.customer.name, ...task.customer.name.split(" "), ...(task.kind === "place_order" ? [task.sku] : [task.orderId]), ...steps.map((s) => s.result?.ref ?? "")].filter(Boolean);
  await learn(d, {
    kind: "incident", parent, triggerIncidentIds: [incidentId], newCases: derivedCases(tool, "incident", n, incidentId),
    brief: `Incident #${n}: ${summary}\nTask: ${taskText(task)}\nTrace (what production saw):\n${trace}\nAfter the run the database held ${effects} ${noun}s for one request, and the agent reported done.`,
    literals, incident: { n, summary }, tool,
    query: { title: "Recall", label: `Incident #${n}`, text: summary },
  });
}

const grant = span("grant issue_refund", grantRefund, () => ({ tool: "issue_refund" }));

async function grantRefund(d: Db) {
  const { version, policy } = await activePolicy(d);
  const v3: Policy = { ...structuredClone(policy), tools: { ...policy.tools, enabled: [...policy.tools.enabled, "issue_refund"] } };
  const granted = version + 1;
  await d.collection("policies").updateMany({ status: "active" }, { $set: { status: "superseded" } });
  const ev = await evaluate(d, v3, `v${granted} (granted)`);
  await d.collection("policies").insertOne({
    _id: `p_${granted}` as never, version: granted, hash: hash(v3), parent: version, status: "active", origin: "operator",
    trigger: { kind: "tool_grant", tool: "issue_refund" }, name: "Grant issue_refund", policy: v3, evalRunId: ev._id, createdAt: new Date(),
    result: { pass: ev.pass, fail: ev.fail, uncertain: ev.uncertain, failedCases: [], screened: [] },
  });
  await d.collection("active_config").updateOne({ _id: "active" as never }, { $set: { version: granted, hash: hash(v3), evalRunId: ev._id, promotedAt: new Date() } }, { upsert: true });
  // Transfer: every live scar on a mutating tool becomes cases for the new tool, before its first call.
  const scars = await d.collection("incidents").find({ origin: "live", toolKind: "mutating" }).toArray();
  const newCases = scars.flatMap((s) => derivedCases("issue_refund", "transfer", s.n, String(s._id)));
  await learn(d, {
    kind: "grant", parent: { version: granted, policy: v3 }, triggerIncidentIds: scars.map((s) => String(s._id)), newCases,
    brief: `The operator granted a new tool, issue_refund (mutating; adds a refund to an order; can time out; takes no idempotency key). It has never run. Past incidents on similar tools are in memory below; their patterns were turned into the refund.xfer cases. Propose changes so issue_refund does not repeat them.`,
    literals: [], tool: "issue_refund",
    query: { title: "Recall for issue_refund", label: "The new tool", text: "issue_refund — mutating; adds a refund to an order; can time out; takes no idempotency key." },
  });
}

// ── Reset ───────────────────────────────────────────────────────────────────

const SEED_INCIDENTS = [
  ["send_receipt_email", "Timed out after sending; the retry sent a second receipt."],
  ["reserve_inventory", "Read a stale replica and reserved the stock twice."],
  ["get_delivery_slots", "Returned an empty list during an outage, read as “no slots”."],
  ["charge_card", "Hit a rate limit; five fast retries locked the account."],
  ["lookup_customer", "Matched two “J. Smith” records and picked the first."],
  ["update_address", "A renamed field was written as null."],
];

export async function reset() {
  const d = await db();
  await d.collection("active_config").deleteMany({});
  for (const c of ["orders", "runs", "incidents", "policies", "eval_cases", "eval_runs", "learning"]) {
    await d.collection(c).drop().catch(() => {});
  }
  await d.collection("orders").createIndex({ scope: 1, customerId: 1, createdAt: -1 });
  await d.collection("orders").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await d.collection("eval_cases").insertMany(SEED_CASES.map((c, i) => ({ ...c, order: i })) as never[]);
  await d.collection("incidents").insertMany(SEED_INCIDENTS.map(([tool, summary], i) => ({
    _id: `seed_${i + 1}`, origin: "seed", tool, toolKind: "mutating", summary, createdAt: new Date(0),
  })) as never[]);
  await d.collection("orders").insertOne({
    orderId: "o_4H8M", scope: "live", runId: "seed", customerId: "c_1180", sku: "GRK-YOG", qty: 3,
    amountCents: 975, refunds: [], createdAt: new Date(), expiresAt: null,
  });
  const ev = await evaluate(d, BASELINE, "v1");
  await d.collection("policies").insertOne({
    _id: "p_1" as never, version: 1, hash: hash(BASELINE), parent: null, status: "active", origin: "baseline", name: "Baseline",
    policy: BASELINE, evalRunId: ev._id, trigger: null, result: { pass: ev.pass, fail: ev.fail, uncertain: ev.uncertain, failedCases: [], screened: [] }, createdAt: new Date(),
  });
  await d.collection("active_config").insertOne({ _id: "active" as never, version: 1, hash: hash(BASELINE), evalRunId: ev._id, promotedAt: new Date() });
}
