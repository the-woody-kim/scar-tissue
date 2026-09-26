import type { Db } from "mongodb";
import type OpenAI from "openai";
import type { Fault, StepView } from "@/lib/state";
import { chat, models } from "./llm";
import { hash, ruleFor, type Guardrail, type Policy } from "./policy";
import { span } from "./trace";

// ── Store data ──────────────────────────────────────────────────────────────

export const CATALOG: Record<string, { name: string; cents: number }> = {
  "OAT-1L": { name: "Oat Milk 1L", cents: 449 },
  "SRD-800": { name: "Sourdough Loaf", cents: 650 },
  "EGG-12": { name: "Free-range Eggs 12", cents: 520 },
  "GRK-YOG": { name: "Greek Yogurt", cents: 325 },
  "BAN-6": { name: "Bananas 6", cents: 299 },
  "COF-500": { name: "Coffee Beans 500g", cents: 1299 },
};

export type Task =
  | { kind: "place_order"; customer: { id: string; name: string }; sku: string; qty: number }
  | { kind: "refund"; customer: { id: string; name: string }; orderId: string; amountCents: number; reason: string; detail: string };

export function taskText(t: Task): string {
  if (t.kind === "place_order") {
    const item = CATALOG[t.sku];
    return `Place an order for ${t.customer.name} (${t.customer.id}): ${t.qty} × ${item.name} (${t.sku}).`;
  }
  return `Refund ${t.customer.name} (${t.customer.id}): ${t.detail} Issue a refund of amountCents ${t.amountCents} with reason "${t.reason}" on order ${t.orderId}.`;
}

// ── Faults (fixed code; the only place a fault plan is read) ────────────────

export type FaultPlanEntry =
  | { tool: string; call: number; fault: Fault }
  | { tool: string; afterTimeout: true; times: number; fault: Fault };

class Injector {
  private calls: Record<string, number> = {};
  private timedOut = false;
  private used = new Map<number, number>();
  constructor(private plan: FaultPlanEntry[]) {}
  next(tool: string): Fault | null {
    const n = (this.calls[tool] = (this.calls[tool] ?? 0) + 1);
    for (const [i, e] of this.plan.entries()) {
      if (e.tool !== tool) continue;
      if ("call" in e && e.call === n) return e.fault;
      if ("afterTimeout" in e && this.timedOut && (this.used.get(i) ?? 0) < e.times) {
        this.used.set(i, (this.used.get(i) ?? 0) + 1);
        return e.fault;
      }
    }
    return null;
  }
  markTimeout() {
    this.timedOut = true;
  }
}

// ── Tools on Atlas ─────────────────────────────────────────────────────────

const MUTATING = new Set(["create_order", "issue_refund"]);
const ARGS: Record<string, string[]> = {
  find_orders: ["customerId", "orderId"],
  create_order: ["customerId", "sku", "qty"],
  issue_refund: ["orderId", "amountCents", "reason"],
};

const id = (prefix: string) =>
  prefix + Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Json = Record<string, unknown>;
type Outcome =
  | { kind: "ok"; value: Json }
  | { kind: "timeout" }
  | { kind: "lookup_error" }
  | { kind: "error"; message: string };

export interface RunContext {
  db: Db;
  scope: string;
  runId: string;
  policy: Policy;
  plan: FaultPlanEntry[];
  timeoutMs: number;
  expiresAt: Date | null;
  // Eval cases replay the agent's call plan instead of asking the model: the harness policy
  // (rules, guardrails, tools) is what decides retries, and ~150 model calls per learning step
  // don't fit OpenRouter's rate limit. Live beats always use the model.
  scripted?: boolean;
}

export class Run {
  steps: StepView[] = [];
  halted = false;
  readonly scripted: boolean;
  private injector: Injector;
  private timedOut = new Set<string>();

  constructor(private ctx: RunContext) {
    this.injector = new Injector(ctx.plan);
    this.scripted = !!ctx.scripted;
  }

  private get orders() {
    return this.ctx.db.collection("orders");
  }

  private async exec(tool: string, args: Json): Promise<Json> {
    const extra = Object.keys(args).filter((k) => !ARGS[tool]?.includes(k));
    if (extra.length) throw new Error(`INVALID_ARGUMENT: unknown field ${extra[0]}`);
    const { scope, runId, expiresAt } = this.ctx;
    if (tool === "find_orders") {
      const q: Json = { scope };
      if (args.customerId) q.customerId = args.customerId;
      if (args.orderId) q.orderId = args.orderId;
      const docs = await this.orders.find(q).sort({ createdAt: -1 }).limit(10).toArray();
      return {
        orders: docs.map((d) => ({
          orderId: d.orderId, customerId: d.customerId, sku: d.sku, qty: d.qty, amountCents: d.amountCents,
          createdAt: d.createdAt, refunds: (d.refunds ?? []).map((r: Json) => ({ refundId: r.refundId, amountCents: r.amountCents, reason: r.reason, createdAt: r.createdAt })),
        })),
      };
    }
    if (tool === "create_order") {
      const item = CATALOG[String(args.sku)];
      if (!item) throw new Error(`INVALID_ARGUMENT: unknown sku ${args.sku}`);
      const qty = Number(args.qty);
      if (!Number.isInteger(qty) || qty < 1) throw new Error("INVALID_ARGUMENT: qty");
      const doc = {
        orderId: id("o_"), scope, runId, customerId: String(args.customerId), sku: String(args.sku), qty,
        amountCents: item.cents * qty, refunds: [], createdAt: new Date(), expiresAt,
      };
      await this.orders.insertOne(doc as never);
      return { orderId: doc.orderId, amountCents: doc.amountCents };
    }
    if (tool === "issue_refund") {
      const refund = { refundId: id("rf_"), runId, amountCents: Number(args.amountCents), reason: String(args.reason), createdAt: new Date() };
      const res = await this.orders.updateOne({ scope, orderId: args.orderId }, { $push: { refunds: refund } } as never);
      if (res.matchedCount === 0) throw new Error(`NOT_FOUND: order ${args.orderId}`);
      return { refundId: refund.refundId };
    }
    throw new Error(`UNKNOWN_TOOL: ${tool}`);
  }

  // One tool invocation through the fault injector, recorded as a step.
  private async invoke(actor: StepView["actor"], tool: string, args: Json, meta: Partial<StepView> = {}): Promise<Outcome> {
    const fault = this.injector.next(tool);
    const t0 = Date.now();
    const step: StepView = { actor, tool, args: argList(tool, args), ...meta };
    this.steps.push(step);
    if (fault === "lookup_error") {
      Object.assign(step, { result: { kind: "lookup_error" }, fault });
      return { kind: "lookup_error" };
    }
    if (fault === "timeout_before_commit") {
      await sleep(this.ctx.timeoutMs);
      this.injector.markTimeout();
      Object.assign(step, { result: { kind: "timeout" }, fault, ms: Date.now() - t0 });
      return { kind: "timeout" };
    }
    let value: Json;
    try {
      value = await this.exec(tool, args);
    } catch (e) {
      step.note = (e as Error).message;
      return { kind: "error", message: (e as Error).message };
    }
    if (fault === "timeout_after_commit") {
      await sleep(this.ctx.timeoutMs);
      this.injector.markTimeout();
      Object.assign(step, { result: { kind: "timeout" }, fault, ms: Date.now() - t0 });
      return { kind: "timeout" };
    }
    step.ms = Date.now() - t0;
    if (tool === "find_orders") {
      const n = (value.orders as unknown[]).length;
      step.result = { kind: "ok", text: `${n} order${n === 1 ? "" : "s"}` };
    } else step.result = { kind: "ok", ref: String(value.orderId ?? value.refundId) };
    return { kind: "ok", value };
  }

  // What the LLM (or a rule) gets back from a tool call, after the policy has acted.
  async call(tool: string, args: Json): Promise<Json> {
    const p = this.ctx.policy;
    if (tool !== "find_orders" && !p.tools.enabled.includes(tool)) return { error: `NOT_GRANTED: ${tool} is not enabled` };
    if (!MUTATING.has(tool)) {
      const r = await this.invoke("llm", tool, args);
      return r.kind === "ok" ? r.value : { error: r.kind === "lookup_error" ? "LOOKUP_UNAVAILABLE" : r.kind === "error" ? r.message : "TIMEOUT" };
    }
    const limit = p.tools.limits[tool];
    if (limit && tool === "issue_refund") {
      const order = await this.orders.findOne({ scope: this.ctx.scope, orderId: args.orderId });
      if ((order?.refunds?.length ?? 0) >= limit.maxPerOrder) {
        this.steps.push({ actor: "harness", tool, args: argList(tool, args), note: "blocked", clause: `tools.limits.${tool}` });
        return { error: `BLOCKED: at most ${limit.maxPerOrder} refund per order` };
      }
    }
    const key = tool + JSON.stringify(args);
    if (this.timedOut.has(key)) return this.llmRetry(tool, args); // the model repeating a timed-out call
    const first = await this.invoke("llm", tool, args);
    if (first.kind === "ok") return first.value;
    if (first.kind === "error") return { error: first.message };
    this.timedOut.add(key);
    const r = ruleFor(p, tool);
    if (!r || r.rule.action === "no_retry" || r.rule.max === 0) return { error: "TIMEOUT: no response; the call may or may not have gone through" };
    for (let i = 0; i < r.rule.max; i++) {
      const out = await this.retryOnce("harness", tool, args, { clause: `rules[${r.index}]`, action: "retry" });
      if (out) return out;
    }
    return { error: "TIMEOUT: no response after retries" };
  }

  private async llmRetry(tool: string, args: Json): Promise<Json> {
    const r = ruleFor(this.ctx.policy, tool);
    if (r?.rule.action === "no_retry") {
      this.steps.push({ actor: "harness", tool, args: argList(tool, args), note: "blocked", clause: `rules[${r.index}]` });
      return { error: `BLOCKED: the policy forbids retrying ${tool} after a timeout` };
    }
    return (await this.retryOnce("llm", tool, args, {})) ?? { error: "TIMEOUT: no response" };
  }

  // A retry, with any guardrail for the tool applied first. null = timed out again.
  private async retryOnce(actor: StepView["actor"], tool: string, args: Json, meta: Partial<StepView>): Promise<Json | null> {
    const gi = this.ctx.policy.guardrails.findIndex((g) => g.tool === tool);
    if (gi >= 0) {
      const v = await this.verify(this.ctx.policy.guardrails[gi], gi, tool, args);
      if (v.kind === "found") {
        this.steps.push({ actor: "harness", tool, args: [], note: "not retried", result: { kind: "adopted", ref: v.ref }, clause: `guardrails[${gi}]`, action: "adopt" });
        return { ...v.record, note: "adopted: this was saved before the timeout" };
      }
      if (v.kind === "halt") {
        this.halted = true;
        this.steps.push({ actor: "harness", tool, args: [], note: "halted", result: { kind: "halted" }, clause: `guardrails[${gi}]` });
        return { error: "HALTED: could not verify whether the call went through" };
      }
    }
    const out = await this.invoke(actor, tool, args, meta);
    if (out.kind === "ok") return out.value;
    if (out.kind === "error") return { error: out.message };
    return null;
  }

  private async verify(g: Guardrail, gi: number, tool: string, args: Json) {
    const lookupArgs: Json = {};
    for (const [k, v] of Object.entries(g.lookup.args)) lookupArgs[k] = v.startsWith("$args.") ? args[v.slice(6)] : v;
    const since = Date.now() - g.lookup.withinSeconds * 1000;
    for (let a = 0; a <= g.onLookupError.recheck; a++) {
      const meta: Partial<StepView> = a === 0 ? { clause: `guardrails[${gi}]`, action: "verify" } : { action: "recheck", recheck: { n: a, of: g.onLookupError.recheck } };
      const r = await this.invoke("harness", "find_orders", lookupArgs, meta);
      if (r.kind === "lookup_error") continue;
      if (r.kind !== "ok") break;
      const orders = r.value.orders as Json[];
      const records = g.lookup.path === "orders" ? orders : orders.flatMap((o) => (o.refunds as Json[]) ?? []);
      const hit = records.find((rec) => g.lookup.match.every((f) => String(rec[f]) === String(args[f])) && new Date(String(rec.createdAt)).getTime() >= since);
      const step = this.steps[this.steps.length - 1];
      if (hit) {
        const ref = String(hit.orderId ?? hit.refundId);
        step.result = { kind: "found", ref };
        const record = g.lookup.path === "orders" ? { orderId: hit.orderId, amountCents: hit.amountCents } : { refundId: hit.refundId };
        return { kind: "found" as const, ref, record };
      }
      step.result = { kind: "ok", text: "nothing saved" };
      return { kind: "proceed" as const };
    }
    return g.onLookupError.then === "halt" ? { kind: "halt" as const } : { kind: "proceed" as const };
  }
}

function argList(tool: string, args: Json): (string | number)[] {
  return (ARGS[tool] ?? Object.keys(args)).filter((k) => args[k] !== undefined).map((k) => args[k] as string | number);
}

// ── Executor: the LLM loop ──────────────────────────────────────────────────

const TOOL_DEFS: Record<string, OpenAI.Chat.Completions.ChatCompletionTool> = {
  find_orders: fn("find_orders", "Read: a customer's 10 most recent orders, with their refunds.", { customerId: { type: "string" }, orderId: { type: "string" } }, []),
  create_order: fn("create_order", "Mutating: places an order. Can time out. Takes no idempotency key.", { customerId: { type: "string" }, sku: { type: "string" }, qty: { type: "integer" } }, ["customerId", "sku", "qty"]),
  issue_refund: fn("issue_refund", "Mutating: adds a refund to an order. Can time out. Takes no idempotency key.", { orderId: { type: "string" }, amountCents: { type: "integer" }, reason: { type: "string" } }, ["orderId", "amountCents", "reason"]),
  report: fn("report", "Ends the task. Call exactly once.", { status: { type: "string", enum: ["done", "failed", "escalated"] }, summary: { type: "string" } }, ["status", "summary"]),
};

function fn(name: string, description: string, properties: Json, required: string[]): OpenAI.Chat.Completions.ChatCompletionTool {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } };
}

export interface Report {
  status: "done" | "failed" | "escalated" | null;
  summary: string;
}

export async function execute(run: Run, policy: Policy, task: Task): Promise<Report> {
  if (run.scripted) return executeScripted(run, task);
  return executeModel(run, policy, taskText(task));
}

// A visitor's own words as the task, same loop and same policy as a beat.
// Beats name the SKU and customer id; a visitor won't, so the prompt run also gets the catalog.
export const executePrompt = (run: Run, policy: Policy, prompt: string, customers: { id: string; name: string }[]) =>
  executeModel(run, policy, prompt, [
    "Catalog (sku: item, price): " + Object.entries(CATALOG).map(([k, v]) => `${k}: ${v.name}, $${(v.cents / 100).toFixed(2)}`).join("; "),
    "Customers (id: name): " + customers.map((c) => `${c.id}: ${c.name}`).join("; "),
  ]);

// The model's tool loop, traced as one "agent" span with each model call under it.
const executeModel = span("agent", async (run: Run, policy: Policy, text: string, extra: string[] = []): Promise<Report> => {
  const notes = Object.entries(policy.context.toolNotes).map(([t, n]) => `- ${t}: ${n}`);
  const system = [
    "You are the order agent for Northside Grocer. Complete the task with the tools, then call report exactly once:",
    'status "done" if the task\'s effect happened, "failed" if it did not, "escalated" if you cannot tell. One-sentence summary.',
    ...(notes.length ? ["Notes on tools:", ...notes] : []),
    ...extra,
  ].join("\n");
  const tools = ["find_orders", ...policy.tools.enabled.filter((t) => t !== "find_orders"), "report"].map((t) => TOOL_DEFS[t]).filter(Boolean);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: text },
  ];
  for (let turn = 0; turn < 8; turn++) {
    if (run.halted) {
      run.steps.push({ actor: "harness", tool: "report", args: [], note: "escalated", quote: "Halted: could not verify whether the call went through." });
      return { status: "escalated", summary: "Halted by guardrail." };
    }
    const res = await chat({ model: models.executor(), temperature: 0, messages, tools, tool_choice: "required" });
    const msg = res.choices[0]?.message;
    if (!msg?.tool_calls?.length) break;
    messages.push(msg);
    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      let args: Json = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {}
      if (call.function.name === "report") {
        const status = (["done", "failed", "escalated"] as const).find((s) => s === args.status) ?? null;
        run.steps.push({ actor: "llm", tool: "report", args: [], note: status ?? "?", quote: String(args.summary ?? "") });
        return { status, summary: String(args.summary ?? "") };
      }
      const out = await run.call(call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out) });
    }
  }
  return { status: null, summary: "" };
}, (...[, policy, text]: [Run, Policy, string, string[]?]) => ({ task: text, policyHash: hash(policy) }), (r) => ({ ...r }));

// The agent's plan for a task, without the model: one mutating call, then an honest report.
async function executeScripted(run: Run, task: Task): Promise<Report> {
  const out =
    task.kind === "place_order"
      ? await run.call("create_order", { customerId: task.customer.id, sku: task.sku, qty: task.qty })
      : await run.call("issue_refund", { orderId: task.orderId, amountCents: task.amountCents, reason: task.reason });
  const status: Report["status"] = run.halted ? "escalated" : "error" in out ? "failed" : "done";
  const summary = status === "done" ? "Done." : String(out.error ?? "Halted.");
  run.steps.push({ actor: "llm", tool: "report", args: [], note: status, quote: summary });
  return { status, summary };
}
