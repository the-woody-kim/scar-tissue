import type { Db } from "mongodb";
import type { ActiveView, BeatId, ConsoleState, HarnessView, IncidentView, MemoryView, PolicyCaseView, RunView, VersionView } from "@/lib/state";
import { db } from "./db";
import { activePolicy, recallFor } from "./harness";
import { holder } from "./lock";
import { Policy, guardrailLines } from "./policy";

// Runtime: the last reload this process's change stream delivered. What's running lives in Atlas
// (./lock), because on Vercel the run and the poll can land on different instances.
const g = globalThis as unknown as { __st_rt?: { reload: { at: string; via: "change stream" } | null; watching: boolean } };
export const runtime = (g.__st_rt ??= { reload: null, watching: false });

export async function watchActiveConfig() {
  if (runtime.watching) return;
  runtime.watching = true;
  try {
    const d = await db();
    d.collection("active_config").watch([], { fullDocument: "updateLookup" }).on("change", () => {
      runtime.reload = { at: new Date().toLocaleTimeString("en-GB", { hour12: false, timeZone: "America/New_York" }), via: "change stream" };
    }).on("error", () => { runtime.watching = false; }).on("close", () => { runtime.watching = false; });
  } catch {
    runtime.watching = false;
  }
}

const BEATS: { id: Exclude<BeatId, "order-n">; label: string }[] = [
  { id: "order-1", label: "Run order #1" },
  { id: "order-2", label: "Run order #2" },
  { id: "grant-issue_refund", label: "Grant issue_refund" },
  { id: "refund-1", label: "Run refund #1" },
];

export async function consoleState(): Promise<ConsoleState> {
  void watchActiveConfig();
  const d = await db();
  const active = await activePolicy(d);
  const activeDoc = await d.collection("policies").findOne({ version: active.version, status: "active" });
  const policy = await policyView(d, active.version, activeDoc?.hash, activeDoc?.evalRunId);

  const runs = await d.collection("runs").find({ scope: "live" }).sort({ startedAt: -1 }).limit(2).toArray();
  const last = runs[0];
  const learning = await d.collection("learning").find().sort({ createdAt: -1 }).limit(1).next();
  const granted = (await d.collection("policies").countDocuments({ origin: "operator" })) > 0;
  const doneBeats = new Set((await d.collection("runs").distinct("beat")) as string[]);
  if (granted) doneBeats.add("grant-issue_refund");
  let nextSet = false;
  const beats = BEATS.map((b) => {
    if (doneBeats.has(b.id)) return { ...b, status: "done" as const };
    if (!nextSet) {
      nextSet = true;
      return { ...b, status: "next" as const };
    }
    return { ...b, status: "todo" as const };
  });

  // Show the learning event if it's newer than the latest run, or a grant right before it.
  const showLearning = learning && (!last || learning.createdAt > last.startedAt ||
    (learning.kind === "grant" && (!runs[1] || learning.createdAt > runs[1].startedAt)));
  const harness: HarnessView = showLearning
    ? learning.kind === "grant"
      ? { kind: "grant", tool: learning.tool, toVersion: learning.fromVersion, before: learning.before, candidates: learning.candidates }
      : { kind: "incident", incident: { ...learning.incident, newCases: learning.newCases }, before: learning.before, candidates: learning.candidates }
    : last
      ? { kind: "clean", ...(await cleanExtras(d, last)), active: activeView(active, policy) }
      : { kind: "idle" };

  const memory: MemoryView = showLearning
    ? { kind: "recall", title: learning.recall.title, index: "$lookup", of: await d.collection("incidents").countDocuments(), query: { label: learning.recall.label, text: learning.recall.text }, hits: learning.recall.hits.map((h: IncidentView) => ({ ...h, score: undefined })), ...(learning.kind === "grant" ? { transferred: { incident: 1, tool: "issue_refund", cases: learning.newCases, note: `Scars turned into cases for the new tool. v${learning.before.version} passed ${learning.before.pass}/${learning.before.total} before any refund had run.` } } : {}) }
    : await storedView(d, (last?.check as { ok?: boolean } | undefined)?.ok !== false);

  const versions: VersionView[] = (await d.collection("policies").find({ status: { $in: ["active", "superseded"] } }).sort({ version: 1 }).toArray()).map((p) => ({
    version: p.version, hash: p.hash, origin: p.origin === "operator" ? "granted" : p.origin, ...(p.trigger?.incidentIds?.length === 1 ? { incident: Number(String(p.trigger.incidentIds[0]).replace("inc_", "")) } : {}), ...(p.evalRunId ? { evalRunId: p.evalRunId } : {}),
  }));

  return {
    mode: process.env.LLM_MODE === "replay" ? "replay" : "live",
    store: { name: "Northside Grocer", agent: "order agent" },
    policy, reload: runtime.reload, beats, running: await holder(),
    run: last ? runView(last) : null, harness, memory, versions,
  };
}

async function policyView(d: Db, version: number, h: string, evalRunId: string | null) {
  const ev = evalRunId ? await d.collection("eval_runs").findOne({ _id: evalRunId as never }) : null;
  const defs = new Map((await d.collection("eval_cases").find().toArray()).map((c) => [c._id as unknown as string, c]));
  const cases: PolicyCaseView[] = (ev?.cases ?? []).map((c: { caseId: string; outcome: PolicyCaseView["outcome"]; result: string }) => ({
    id: c.caseId, outcome: c.outcome, origin: defs.get(c.caseId)?.origin ?? "seed", about: defs.get(c.caseId)?.about ?? "", result: c.result,
  }));
  return { version, hash: h, pass: cases.filter((c) => c.outcome === "pass").length, total: cases.length, evalRunId, cases };
}

function activeView(active: { version: number; policy: Policy }, policy: { evalRunId: string | null; cases: PolicyCaseView[] }): ActiveView {
  const gs = active.policy.guardrails;
  const diff = gs.length ? gs.flatMap((g, i) => guardrailLines(g, i)) : active.policy.rules.map((r, i) => `rules[${i}]  ${r.action}  ${r.tool} · on ${r.on}`);
  return {
    version: active.version, section: gs.length ? "guardrails" : "rules", evalRunId: policy.evalRunId ?? "baseline", diff,
    cases: policy.cases.map((c) => ({ id: c.id, outcome: c.outcome })), note: "The active version. Every case above passed before it shipped.",
  };
}

async function cleanExtras(d: Db, last: Record<string, unknown>) {
  if ((last.task as { prompt?: true }).prompt) return {}; // a visitor's request isn't a rerun of the incident
  const incidentRun = await d.collection("runs").findOne({ "check.ok": false, "task.kind": (last.task as { kind: string }).kind }, { sort: { startedAt: 1 } });
  if (!incidentRun || incidentRun._id === last._id) return {};
  const summary = (r: Record<string, unknown>) => {
    const check = r.check as { effects: number; ok: boolean; noun: "order" | "refund" };
    const steps = (r.steps as { result?: { kind: string }; action?: string; fault?: string }[]) ?? [];
    const adopted = steps.some((s) => s.result?.kind === "adopted");
    const retried = steps.some((s) => s.action === "retry");
    const faulted = steps.some((s) => s.fault);
    const note = !check.ok ? "Retried without checking." : adopted ? "Checked first, found it, adopted it." : retried ? "Checked first, found nothing, retried once." : faulted ? "Recovered from the fault." : "No fault; placed once.";
    return { label: String(r.title).toLowerCase(), version: r.policyVersion as number, hash: r.policyHash as string, effects: check.effects, noun: check.noun, ok: check.ok, note };
  };
  return { compare: { before: summary(incidentRun), after: summary(last) } };
}

function runView(r: Record<string, unknown>): RunView {
  return {
    title: r.title as string, policy: { version: r.policyVersion as number, hash: r.policyHash as string },
    startedAt: (r.startedAt as Date).toLocaleTimeString("en-GB", { hour12: false, timeZone: "America/New_York" }),
    task: r.task as RunView["task"], picked: (r.picked as RunView["picked"]) ?? null, steps: r.steps as RunView["steps"], check: r.check as RunView["check"],
  };
}

async function storedView(d: Db, passed: boolean): Promise<MemoryView> {
  const all = await recallFor(d, "create_order");
  const live = all.filter((h) => h.origin === "live");
  const seed = all.filter((h) => h.origin === "seed").map((h) => ({ tool: h.tool, summary: h.summary }));
  return { kind: "stored", counts: { live: live.length, seed: seed.length }, note: !passed ? "No recall this run — the incident was stored, but it isn't the retry fault the harness learns from." : live.length ? "No recall this run — the check passed, so nothing new was stored." : null, live, seed };
}
