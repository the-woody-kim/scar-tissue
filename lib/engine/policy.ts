import { createHash } from "node:crypto";
import { z } from "zod";

// The only thing the agent can change. Typed data, never free text or code.
export const Rule = z.object({
  tool: z.string(),
  on: z.literal("timeout"),
  action: z.enum(["retry", "no_retry"]),
  max: z.number().int().min(0).max(3),
}).strict();

export const Guardrail = z.object({
  kind: z.literal("verify_before_retry"),
  tool: z.string(),
  lookup: z.object({
    tool: z.literal("find_orders"),
    args: z.record(z.string(), z.string()),
    path: z.enum(["orders", "orders.*.refunds"]),
    match: z.array(z.string()).min(1),
    withinSeconds: z.number().int().min(1).max(3600),
  }).strict(),
  onFound: z.literal("adopt"),
  onLookupError: z.object({ recheck: z.number().int().min(0).max(3), then: z.enum(["halt", "proceed"]) }).strict(),
}).strict();

export const Policy = z.object({
  rules: z.array(Rule),
  guardrails: z.array(Guardrail),
  context: z.object({ toolNotes: z.record(z.string(), z.string().max(200)) }).strict(),
  tools: z.object({
    enabled: z.array(z.string()),
    limits: z.record(z.string(), z.object({ maxPerOrder: z.number().int().min(1) }).strict()),
  }).strict(),
}).strict();

export type Policy = z.infer<typeof Policy>;
export type Rule = z.infer<typeof Rule>;
export type Guardrail = z.infer<typeof Guardrail>;

export const BASELINE: Policy = {
  rules: [{ tool: "*", on: "timeout", action: "retry", max: 2 }],
  guardrails: [],
  context: { toolNotes: {} },
  tools: { enabled: ["find_orders", "create_order"], limits: {} },
};

// A candidate is one typed change to its parent.
export const Change = z.discriminatedUnion("section", [
  z.object({ section: z.literal("rules"), rule: Rule }).strict(),
  z.object({ section: z.literal("guardrails"), guardrail: Guardrail }).strict(),
  z.object({ section: z.literal("context"), tool: z.string(), note: z.string().max(200) }).strict(),
  z.object({ section: z.literal("tools"), tool: z.string(), maxPerOrder: z.number().int().min(1) }).strict(),
]);
export type Change = z.infer<typeof Change>;

export function apply(parent: Policy, c: Change): Policy {
  const p: Policy = structuredClone(parent);
  if (c.section === "rules") p.rules = [c.rule, ...p.rules]; // specific rules win: checked first
  if (c.section === "guardrails") p.guardrails.push(c.guardrail);
  if (c.section === "context") p.context.toolNotes[c.tool] = c.note;
  if (c.section === "tools") p.tools.limits[c.tool] = { maxPerOrder: c.maxPerOrder };
  return Policy.parse(p);
}

// Human-readable diff lines for the harness panel, one change per candidate.
export function diffLines(parent: Policy, c: Change): string[] {
  if (c.section === "rules") {
    return [`+ rules[${parent.rules.length}]  ${c.rule.action}  ${c.rule.tool} · on ${c.rule.on}${c.rule.action === "retry" ? ` · max ${c.rule.max}` : ""}`];
  }
  if (c.section === "guardrails") return guardrailLines(c.guardrail, parent.guardrails.length).map((l) => "+ " + l);
  if (c.section === "context") return [`+ context.toolNotes.${c.tool}  "${c.note}"`];
  return [`+ tools.limits.${c.tool}  { maxPerOrder: ${c.maxPerOrder} }`];
}

export function guardrailLines(g: Guardrail, i: number): string[] {
  const args = Object.keys(g.lookup.args).join(", ");
  return [
    `guardrails[${i}]  ${g.kind}  ${g.tool}`,
    `  lookup  ${g.lookup.tool}(${args}) → ${g.lookup.path}`,
    `  match   ${g.lookup.match.join(", ")} · within ${g.lookup.withinSeconds} s`,
    `  found → adopt · lookup error → recheck ×${g.onLookupError.recheck}, then ${g.onLookupError.then}`,
  ];
}

export function hash(p: Policy): string {
  return createHash("sha256").update(canonical(p)).digest("hex").slice(0, 6);
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function ruleFor(p: Policy, tool: string): { rule: Rule; index: number } | null {
  const i = p.rules.findIndex((r) => r.tool === tool);
  const j = i >= 0 ? i : p.rules.findIndex((r) => r.tool === "*");
  return j >= 0 ? { rule: p.rules[j], index: j } : null;
}
