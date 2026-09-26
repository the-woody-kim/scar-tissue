import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { db } from "./db";
import { activePolicy, planFor, type Pick } from "./harness";
import { hash, type Policy } from "./policy";
import { CATALOG, Run, type FaultPlanEntry } from "./run";

// The order tools over MCP, so an agent we don't own (Strands, Claude, anything MCP) runs under the
// harness. Each session pins the active policy when it connects and gets one Run: the same
// Run.call() the executor uses, so rules, guardrails, tool grants and limits all apply. The agent
// sees only the granted tools; the fault pick comes from the URL and only the injector reads it.

type Json = Record<string, unknown>;
interface Session {
  transport: WebStandardStreamableHTTPServerTransport;
  run: Run;
  runId: string;
  version: number;
  policyHash: string;
  picked: Pick | null;
  startedAt: Date;
  queue: Promise<unknown>;
}

const g = globalThis as unknown as { __st_mcp?: Map<string, Session> };
const sessions = (g.__st_mcp ??= new Map());

const PICKS: Pick[] = ["after_commit", "before_commit", "after_commit_lookup_down", "none"];

const SCHEMAS = {
  find_orders: {
    description: "Read: a customer's 10 most recent orders, with their refunds. Pass customerId, orderId, or both.",
    input: { customerId: z.string().optional(), orderId: z.string().optional() },
    mutating: false,
  },
  create_order: {
    description: `Mutating: places an order. Can time out. Takes no idempotency key. SKUs: ${Object.entries(CATALOG).map(([k, v]) => `${k} (${v.name})`).join(", ")}.`,
    input: { customerId: z.string(), sku: z.string(), qty: z.number().int().min(1) },
    mutating: true,
  },
  issue_refund: {
    description: "Mutating: adds a refund to an order. Can time out. Takes no idempotency key.",
    input: { orderId: z.string(), amountCents: z.number().int().min(1), reason: z.string() },
    mutating: true,
  },
} as const;

function faultPlan(pick: Pick | null): FaultPlanEntry[] {
  if (!pick) return [];
  const all = [...planFor(pick, "create_order"), ...planFor(pick, "issue_refund")];
  return all.filter((e, i) => all.findIndex((f) => JSON.stringify(f) === JSON.stringify(e)) === i);
}

function buildServer(s: Omit<Session, "transport" | "queue">, policy: Policy, getSession: () => Session) {
  const notes = Object.entries(policy.context.toolNotes).map(([t, n]) => `- ${t}: ${n}`);
  const server = new McpServer(
    { name: "scar-tissue", version: `v${s.version}-${s.policyHash}` },
    {
      instructions: [
        `Northside Grocer order tools, under harness policy v${s.version} (${s.policyHash}).`,
        "A call may time out; the harness applies the policy's retry rules and guardrails for you.",
        ...(notes.length ? ["Notes on tools:", ...notes] : []),
      ].join("\n"),
    },
  );
  const enabled = ["find_orders", ...policy.tools.enabled.filter((t) => t !== "find_orders")];
  for (const name of enabled) {
    const def = SCHEMAS[name as keyof typeof SCHEMAS];
    if (!def) continue;
    const note = policy.context.toolNotes[name];
    server.registerTool(
      name,
      {
        description: note ? `${def.description} Note: ${note}` : def.description,
        inputSchema: def.input,
        annotations: { readOnlyHint: !def.mutating, idempotentHint: !def.mutating },
      },
      async (args: Json) => {
        const session = getSession();
        // One call at a time per session: the Run's timeout and retry state is sequential.
        const p = session.queue.then(() => call(s, name, args));
        session.queue = p.catch(() => {});
        const out = await p;
        return { content: [{ type: "text" as const, text: JSON.stringify(out) }], isError: "error" in (out as Json) };
      },
    );
  }
  return server;
}

async function call(s: Omit<Session, "transport" | "queue">, tool: string, raw: Json): Promise<Json> {
  const args = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined));
  const out = s.run.halted
    ? { error: "HALTED: an earlier call could not be verified; escalate to a human" }
    : await s.run.call(tool, args).catch((e: Error) => ({ error: e.message }));
  // Recorded after every call, with the hash it ran under. scope "mcp" keeps it off the beat page.
  const d = await db();
  await d.collection("runs").updateOne(
    { _id: s.runId as never },
    {
      $set: { steps: s.run.steps, halted: s.run.halted, updatedAt: new Date() },
      $setOnInsert: { scope: "mcp", source: "mcp", title: "MCP session", startedAt: s.startedAt, policyVersion: s.version, policyHash: s.policyHash, picked: s.picked },
    },
    { upsert: true },
  );
  return out;
}

async function open(req: Request): Promise<Session> {
  const d = await db();
  const { version, policy } = await activePolicy(d);
  const q = new URL(req.url).searchParams.get("fault") as Pick | null;
  const picked = q && PICKS.includes(q) ? q : null;
  const runId = `m_${Date.now().toString(36)}`;
  const run = new Run({ db: d, scope: "live", runId, policy, plan: faultPlan(picked), timeoutMs: 1500, expiresAt: null });
  const base = { run, runId, version, policyHash: hash(policy), picked, startedAt: new Date() };
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (id) => void sessions.set(id, session),
    onsessionclosed: (id) => void sessions.delete(id),
  });
  const session: Session = { ...base, transport, queue: Promise.resolve() };
  await buildServer(base, policy, () => session).connect(transport);
  return session;
}

export async function handleMcp(req: Request): Promise<Response> {
  const id = req.headers.get("mcp-session-id");
  if (id) {
    const s = sessions.get(id);
    if (!s) return rpcError(404, "Session not found; reconnect");
    return s.transport.handleRequest(req);
  }
  if (req.method !== "POST") return rpcError(400, "Missing mcp-session-id");
  return (await open(req)).transport.handleRequest(req);
}

const rpcError = (status: number, message: string) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status });
