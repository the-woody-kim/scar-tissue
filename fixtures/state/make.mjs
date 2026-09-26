// Writes the page's fixture states (fixtures/state/*.json) from the canvas's moments.
// Run: node fixtures/state/make.mjs — edit here, not in the JSON. Owned by Opus (design).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL(".", import.meta.url));

const base = { mode: "live", store: { name: "Northside Grocer", agent: "order agent" }, running: null };
const beats = (done) =>
  [
    ["order-1", "Run order #1"],
    ["order-2", "Run order #2"],
    ["grant-issue_refund", "Grant issue_refund"],
    ["refund-1", "Run refund #1"],
  ].map(([id, label], i) => ({ id, label, status: i < done ? "done" : i === done ? "next" : "todo" }));

const c = (id, outcome = "pass", lit) => (lit ? { id, outcome, lit: true } : { id, outcome });
const orderCases = (o = {}) =>
  ["order.happy", "order.transient", "order.inc1", "order.inc1+lookup"].map((id) => c(id, o[id] ?? "pass", o.lit === id));
const allCases = (o = {}) =>
  [
    "order.happy", "order.transient", "order.inc1", "order.inc1+lookup", "refund.happy",
    "refund.partial_x2", "refund.transient", "refund.xfer1", "refund.xfer1+lookup",
  ].map((id) => c(id, o[id] ?? "pass", o.lit === id));

const seed = [
  ["send_receipt_email", "Timed out after sending; the retry sent a second receipt."],
  ["reserve_inventory", "Read a stale replica and reserved the stock twice."],
  ["get_delivery_slots", "Returned an empty list during an outage, read as “no slots”."],
  ["charge_card", "Hit a rate limit; five fast retries locked the account."],
  ["lookup_customer", "Matched two “J. Smith” records and picked the first."],
  ["update_address", "A renamed field was written as null."],
].map(([tool, summary]) => ({ tool, summary }));

const inc1 = "create_order timed out after the order was saved; the retry placed it again.";
const attempts1 = [
  { name: "Check before retrying", version: 2, status: "promoted", detail: "4/4" },
  { name: "Never retry", status: "rejected", detail: "failed order.transient" },
  { name: "Don't retry c_2041", status: "screened", detail: "named the incident" },
];
const liveInc1 = (carried) => ({
  origin: "live", tool: "create_order", incident: 1,
  summary: "Timed out after the order was saved; the retry placed it again.",
  attempts: attempts1, ...(carried ? { carried } : {}),
});
const stored = (live, carried) => ({
  kind: "stored", counts: { live, seed: 6 },
  note: live ? "No recall this run — the check passed, so nothing new was stored." : null,
  live: live ? [liveInc1(carried)] : [], seed,
});

const v1 = { version: 1, hash: "3b7e04", origin: "baseline" };
const v2 = { version: 2, hash: "9f2c1a", origin: "learned", incident: 1, evalRunId: "e_0412" };
const v3 = { version: 3, hash: "5d0e93", origin: "granted" };
const v4 = { version: 4, hash: "c81d77", origin: "transfer", incident: 1, evalRunId: "e_0431" };

const guard0 = [
  "guardrails[0]  verify_before_retry  create_order",
  "  lookup  find_orders(customerId) → orders",
  "  match   sku, qty · within 120 s",
  "  found → adopt · lookup error → recheck ×2, then halt",
];
const plus = (lines) => lines.map((l) => "+ " + l);
const ok = (noun) => ({ noun, effects: 1, expected: 1, scope: "live", report: { status: "done", agrees: true }, ok: true });

const order1Run = {
  title: "Order #1", policy: { version: 1, hash: "3b7e04" }, startedAt: "14:01:52",
  task: { kind: "place_order", customer: { id: "c_2041", name: "Ana Ruiz" }, detail: "2 × Oat Milk 1L (OAT-1L) at $4.49." },
  picked: null,
  steps: [
    { actor: "llm", tool: "create_order", args: ["c_2041", "OAT-1L", 2], result: { kind: "timeout" }, ms: 1504, fault: "timeout_after_commit" },
    { actor: "harness", tool: "create_order", args: ["c_2041", "OAT-1L", 2], result: { kind: "ok", ref: "o_7Q2L" }, clause: "rules[0]", action: "retry", ms: 318 },
    { actor: "llm", tool: "report", args: [], note: "done", quote: "Order placed for Ana — 2 × Oat Milk 1L." },
  ],
  check: { noun: "order", effects: 2, expected: 1, scope: "live", report: { status: "done", agrees: false }, ok: false },
};
const order2Run = {
  title: "Order #2", policy: { version: 2, hash: "9f2c1a" }, startedAt: "14:03:18",
  task: { kind: "place_order", customer: { id: "c_3317", name: "Marcus Chen" }, detail: "1 × Sourdough Loaf (SRD-800) at $6.50." },
  picked: null,
  steps: [
    { actor: "llm", tool: "create_order", args: ["c_3317", "SRD-800", 1], result: { kind: "timeout" }, ms: 1506, fault: "timeout_after_commit" },
    { actor: "harness", tool: "find_orders", args: ["c_3317"], result: { kind: "found", ref: "o_9M3P" }, clause: "guardrails[0]", action: "verify", ms: 181 },
    { actor: "harness", tool: "create_order", args: [], note: "not retried", result: { kind: "adopted", ref: "o_9M3P" }, clause: "guardrails[0]", action: "adopt" },
    { actor: "llm", tool: "report", args: [], note: "done", quote: "Order placed for Marcus — 1 × Sourdough Loaf." },
  ],
  check: ok("order"),
};
const refund1Run = {
  title: "Refund #1", policy: { version: 4, hash: "c81d77" }, startedAt: "14:07:05",
  task: { kind: "refund", customer: { id: "c_1180", name: "Priya Nair" }, detail: "1 of 3 Greek Yogurt arrived damaged — $3.25 on order o_4H8M." },
  picked: null,
  steps: [
    { actor: "llm", tool: "find_orders", args: ["c_1180"], result: { kind: "ok", text: "1 order" }, ms: 188 },
    { actor: "llm", tool: "issue_refund", args: ["o_4H8M", 325, "damaged"], result: { kind: "timeout" }, ms: 1502, fault: "timeout_after_commit" },
    { actor: "harness", tool: "find_orders", args: ["o_4H8M"], result: { kind: "found", ref: "rf_91C2" }, clause: "guardrails[1]", action: "verify", ms: 176 },
    { actor: "harness", tool: "issue_refund", args: [], note: "not retried", result: { kind: "adopted", ref: "rf_91C2" }, clause: "guardrails[1]", action: "adopt" },
    { actor: "llm", tool: "report", args: [], note: "done", quote: "Refunded $3.25 for the damaged yogurt." },
  ],
  check: ok("refund"),
};
const order3Run = {
  title: "Order #3", policy: { version: 4, hash: "c81d77" }, startedAt: "14:09:42",
  task: { kind: "place_order", customer: { id: "c_4410", name: "Dana Okafor" }, detail: "3 × Free-range Eggs 12 (EGG-12) at $5.20." },
  picked: "after_commit_lookup_down",
  steps: [
    { actor: "llm", tool: "create_order", args: ["c_4410", "EGG-12", 3], result: { kind: "timeout" }, ms: 1503, fault: "timeout_after_commit" },
    { actor: "harness", tool: "find_orders", args: ["c_4410"], result: { kind: "lookup_error" }, clause: "guardrails[0]", action: "verify", fault: "lookup_error" },
    { actor: "harness", tool: "find_orders", args: ["c_4410"], result: { kind: "lookup_error" }, action: "recheck", recheck: { n: 1, of: 2 }, fault: "lookup_error" },
    { actor: "harness", tool: "find_orders", args: ["c_4410"], result: { kind: "found", ref: "o_2K7D" }, action: "recheck", recheck: { n: 2, of: 2 }, ms: 179 },
    { actor: "harness", tool: "create_order", args: [], note: "not retried", result: { kind: "adopted", ref: "o_2K7D" }, clause: "guardrails[0]", action: "adopt" },
    { actor: "llm", tool: "report", args: [], note: "done", quote: "Order placed for Dana — 3 × Free-range Eggs." },
  ],
  check: ok("order"),
};

const grantHarness = {
  kind: "grant", tool: "issue_refund", toVersion: 3, before: { version: 3, pass: 7, total: 9 },
  candidates: [
    {
      letter: "A", name: "One refund per order", section: "tools", status: "rejected",
      diff: ["+ tools.limits.issue_refund  { maxPerOrder: 1 }"],
      cases: allCases({ "refund.partial_x2": "fail", "refund.xfer1": "fail", "refund.xfer1+lookup": "fail" }),
      failed: { caseId: "refund.partial_x2", detail: "blocked a second, legitimate refund." },
    },
    {
      letter: "B", name: "Check before retrying refunds", section: "guardrails", status: "promoted", promotedTo: 4,
      diff: plus([
        "guardrails[1]  verify_before_retry  issue_refund",
        "  lookup  find_orders(orderId) → orders.*.refunds",
        "  match   amountCents, reason · within 120 s",
        "  found → adopt · lookup error → recheck ×2, then halt",
      ]),
      highlights: ["orders.*.refunds", "amountCents, reason"],
      cases: allCases(),
    },
  ],
};
const grantMemory = {
  kind: "recall", title: "Recall for issue_refund", index: "incidents_vec", of: 7,
  query: { label: "The new tool", text: "issue_refund — mutating; adds a refund to an order; can time out; takes no idempotency key." },
  hits: [
    { score: 0.91, ...liveInc1() },
    { score: 0.84, origin: "seed", tool: "send_receipt_email", summary: seed[0].summary, attempts: [] },
    { score: 0.66, origin: "seed", tool: "reserve_inventory", summary: seed[1].summary, attempts: [] },
  ],
  transferred: {
    incident: 1, tool: "issue_refund", cases: ["refund.xfer1", "refund.xfer1+lookup"],
    note: "The same fault pattern, mapped onto the new tool. Both failed on v3 — before any refund had run.",
  },
};

const pc = (id, origin, about, result) => ({ id, outcome: "pass", origin, about, result });
const orderSuite = [
  pc("order.happy", "seed", "no fault", "1 order · done"),
  pc("order.transient", "seed", "times out before saving", "retried · 1 order · done"),
];
const incidentSuite = [
  pc("order.inc1", "incident", "times out after saving", "found and adopted · 1 order · done"),
  pc("order.inc1+lookup", "incident", "after saving, then 2 lookups fail", "rechecked, adopted · 1 order · done"),
];
const refundSuite = [
  pc("refund.happy", "seed", "no fault", "1 refund · done"),
  pc("refund.partial_x2", "seed", "two legitimate partial refunds", "2 refunds · done"),
  pc("refund.transient", "seed", "times out before saving", "retried · 1 refund · done"),
  pc("refund.xfer1", "transfer", "incident #1's pattern on issue_refund", "found and adopted · 1 refund · done"),
  pc("refund.xfer1+lookup", "transfer", "the same, with 2 lookups failing", "rechecked, adopted · 1 refund · done"),
];
const policyOf = (version, hash, evalRunId, cases) => ({ version, hash, pass: cases.length, total: cases.length, evalRunId, cases });
const v1policy = policyOf(1, "3b7e04", null, orderSuite);
const v2policy = policyOf(2, "9f2c1a", "e_0412", [...orderSuite, ...incidentSuite]);
const v4policy = policyOf(4, "c81d77", "e_0431", [...orderSuite, ...incidentSuite, ...refundSuite]);
const fixtures = {
  reset: {
    ...base, policy: v1policy, reload: null, beats: beats(0),
    run: null, harness: { kind: "idle" }, memory: stored(0), versions: [v1],
  },
  "order-1": {
    ...base, policy: v2policy, reload: { at: "14:02:07", via: "change stream" },
    beats: beats(1), run: order1Run,
    harness: {
      kind: "incident",
      incident: { n: 1, summary: inc1, newCases: ["order.inc1", "order.inc1+lookup"] },
      before: { version: 1, pass: 2, total: 4 },
      candidates: [
        {
          letter: "A", name: "Never retry create_order", section: "rules", status: "rejected",
          diff: ["+ rules[1]  no_retry  create_order · on timeout"],
          cases: orderCases({ "order.transient": "fail", "order.inc1": "fail", "order.inc1+lookup": "fail" }),
          failed: { caseId: "order.transient", detail: "0 orders; that timeout needed a retry." },
        },
        { letter: "B", name: "Check before retrying", section: "guardrails", status: "promoted", promotedTo: 2, diff: plus(guard0), cases: orderCases() },
        {
          letter: "C", name: "Don't retry c_2041", section: "context", status: "screened",
          diff: ["+ context.toolNotes.create_order  \"Orders for c_2041 (OAT-1L) can time out after saving; don't retry them.\""],
          cases: [], screened: ["c_2041", "OAT-1L"],
        },
      ],
    },
    memory: {
      kind: "recall", title: "Recall", index: "incidents_vec", of: 7,
      query: { label: "Incident #1", text: inc1 },
      hits: [
        { score: 0.87, origin: "seed", tool: "send_receipt_email", summary: seed[0].summary, attempts: [] },
        { score: 0.79, origin: "seed", tool: "reserve_inventory", summary: seed[1].summary, attempts: [] },
        { score: 0.58, origin: "seed", tool: "charge_card", summary: seed[3].summary, attempts: [] },
      ],
    },
    versions: [v1, v2],
  },
  "order-2": {
    ...base, policy: v2policy, reload: { at: "14:02:07", via: "change stream" },
    beats: beats(2), run: order2Run,
    harness: {
      kind: "clean",
      compare: {
        before: { label: "order #1", version: 1, hash: "3b7e04", effects: 2, noun: "order", ok: false, note: "Retried without checking." },
        after: { label: "order #2", version: 2, hash: "9f2c1a", effects: 1, noun: "order", ok: true, note: "Checked first, found it, adopted it." },
      },
      active: {
        version: 2, section: "guardrails", evalRunId: "e_0412", diff: guard0, cases: orderCases(),
        note: "Fired once, on order #2: found o_9M3P and adopted it instead of placing it again.",
      },
    },
    memory: stored(1), versions: [v1, v2],
  },
  grant: {
    ...base, policy: v4policy, reload: { at: "14:06:41", via: "change stream" }, beats: beats(3),
    run: order2Run, harness: grantHarness, memory: grantMemory, versions: [v1, v2, v3, v4],
  },
  "refund-1": {
    ...base, policy: v4policy, reload: { at: "14:06:41", via: "change stream" }, beats: beats(4),
    run: refund1Run, harness: grantHarness, memory: grantMemory, versions: [v1, v2, v3, v4],
  },
  "order-n": {
    ...base, policy: v4policy, reload: { at: "14:06:41", via: "change stream" }, beats: beats(4), run: order3Run,
    harness: {
      kind: "clean",
      pick: {
        pick: "after_commit_lookup_down", caseId: "order.inc1+lookup",
        note: "Derived from incident #1 and passed by every version since v2. The live run took the path the test did: two failed lookups, a recheck, then the saved order adopted.",
      },
      active: {
        version: 4, section: "guardrails", evalRunId: "e_0431", diff: guard0, highlights: ["recheck ×2, then halt"],
        cases: allCases({ lit: "order.inc1+lookup" }), note: "The underlined clause is the one that acted on this run.",
      },
    },
    memory: stored(1, { tool: "issue_refund", caseId: "refund.xfer1", version: 4 }), versions: [v1, v2, v3, v4],
  },
};

for (const [name, state] of Object.entries(fixtures)) {
  writeFileSync(`${out}/${name}.json`, JSON.stringify(state, null, 2) + "\n");
}
console.log(Object.keys(fixtures).join(" "));
