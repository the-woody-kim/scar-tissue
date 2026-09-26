# SPEC.md — Scar Tissue (as built)

MongoDB Harness Engineering & Model Wrangling Hackathon · 2026-09-26 · solo · 1-minute video ·
Statement One: Recursive Harnessing

This file describes what the code does. Where it and a mockup in `plans/screens/` differ, this
file wins; where it and the code differ, fix whichever is wrong.

## 1. The problem

Agents that take real actions repeat operational mistakes — a retry after a timeout that had
already succeeded places a second order — because nothing turns a failure into a tested, lasting
change to how the agent runs.

## 2. The loop

An LLM agent runs Northside Grocer's orders (fictional) in MongoDB Atlas. After every live run:

1. **Check** — fixed code counts the effects in the run's scope and compares them with the
   agent's report.
2. **Incident** — a failed check whose trace shows a mutating call that timed out and then an
   extra record becomes an incident. It yields two cases: `<domain>.inc<N>` (timeout after
   saving) and `<domain>.inc<N>+lookup` (the same, with the next two lookups failing).
3. **Recall** — one aggregation over `incidents` with `$lookup` into `policies`, so each incident
   arrives with the fixes it produced — promoted, rejected, screened.
4. **Propose** — the proposer model gets the policy DSL, the current policy, the trace (never the
   injector's labels), the cases and the recall, and returns exactly three candidates, each a
   single typed change to a **different** section.
5. **Screen** — a candidate whose change contains the incident's literals (customer id and name,
   SKU or order id, the record ids in the trace) is rejected before any case runs.
6. **Evaluate** — each remaining candidate runs the whole suite. A case is `pass`, `fail` or
   `uncertain` (exception, timeout, no report). Uncertain never promotes.
7. **Promote** — a candidate with 0 fail, 0 uncertain and more passes than the parent wins; ties
   go to the smallest change. Its policy is stored with its hash, parent, trigger and eval run;
   `active_config` points at it.
8. **Reload** — a change stream on `active_config` updates the runtime, and the header shows
   `reloaded <time> via change stream`.
9. **Transfer** — granting `issue_refund` creates v3 (the operator's grant), maps every live scar on
   a mutating tool onto the new tool as `refund.xfer<N>` cases, and runs steps 3–8 before the
   tool's first call.

Steps 2–8 run with no human input.

**Prior art.** RRSI (arXiv 2609.24972) shows recursive harness edits overfit to the tasks that
caused them unless regularized — an edit budget, a leakage screen, a no-regression floor. Here:
one change per candidate, the leakage screen, every case must pass, and transfer before first use.

## 3. Where MongoDB does the work

| Job | Atlas feature | Collection |
|---|---|---|
| Data the agent acts on | documents, embedded arrays, TTL | `orders` with embedded `refunds`; every document has a `scope` (`live` or `<evalRunId>/<caseId>`); eval data expires by TTL on `expiresAt` |
| Execution history | documents | `runs`: task, steps, report, check, policy version and hash |
| Memory | aggregation `$lookup` | `incidents` joined to `policies` by `trigger.incidentIds` |
| Versioned harness | documents | `policies`: version, hash, parent, status, origin, change, diff, eval run, result |
| Evaluation | documents | `eval_cases` (seed / incident / transfer), `eval_runs` |
| Live reload | change stream | `active_config` (one document) |
| The harness panel | documents | `learning`: one per incident or grant, with the candidates as shown |

Not built: Atlas Vector Search over incidents. The memory panel says `Atlas · $lookup` and shows
no similarity scores.

## 4. The page (1536 × 920)

- **Header:** name · `reloaded … via change stream` · policy pill (`Policy v4 · 9/9 cases · hash`;
  click → the eval run's case grid) · `LIVE` / `REPLAY` / `FIXTURE`.
- **Beats row:** `Run order #1` · `Run order #2` · `Grant issue_refund` · `Run refund #1` (the server
  refuses a beat out of order) · the fault picker · `Run another order` · `Reset demo`.
- **01 · Run:** task; steps `actor · tool · args`, then outcome, policy clause and action, ms, and a
  dashed injector tag; the report quote; the check card.
- **02 · Harness:** the phase line; incident or grant card; candidates A–C with section, diff,
  cases, stamp (`PROMOTED → vN`, `REJECTED`, `SCREENED`) and the failing case; version history.
  After a clean run: the same-fault comparison and the active version.
- **03 · Memory:** the recall query and incidents with their attempts; transferred cases after a
  grant; otherwise what's stored.

`/?fixture=<name>` renders a saved state from `fixtures/state/` (`node fixtures/state/make.mjs`
regenerates them). Plain `/` polls `GET /api/state` every 500 ms.

## 5. Architecture

```
 Page ── GET /api/state (500 ms) ── POST /api/beat {beat, fault?} ── POST /api/reset
   │
 Next.js, one long-lived process (next dev / next start)
   runtime: running beat + last reload (globalThis) ◄── change stream on active_config
   Run (lib/engine/run.ts): executor LLM → harness.call → policy (rules, guardrails,
        limits) → fault injector → tools on Atlas
   harness (lib/engine/harness.ts): check → incident → cases → recall → propose →
        screen → evaluate → promote → active_config
   every model call goes through chat(): at most LLM_CONCURRENCY in flight, 429s back off
```

## 6. Policy — the only thing the agent can change (`lib/engine/policy.ts`)

```json
{
  "rules": [{ "tool": "*", "on": "timeout", "action": "retry", "max": 2 }],
  "guardrails": [{
    "kind": "verify_before_retry", "tool": "create_order",
    "lookup": { "tool": "find_orders", "args": { "customerId": "$args.customerId" },
                "path": "orders", "match": ["sku", "qty"], "withinSeconds": 60 },
    "onFound": "adopt",
    "onLookupError": { "recheck": 2, "then": "halt" }
  }],
  "context": { "toolNotes": { "create_order": "…" } },
  "tools": { "enabled": ["find_orders", "create_order"], "limits": { "issue_refund": { "maxPerOrder": 1 } } }
}
```

- A candidate is one change: add a rule (checked before `*`), add a guardrail, set a tool note
  (≤ 200 chars, shown to the executor), or set a refund limit. zod validates it; an invalid one is
  rejected as uncertain.
- A retry is the harness re-calling after a timeout, or the model repeating a timed-out call with
  the same arguments. Guardrails apply to both; `no_retry` blocks both.
- A guardrail halt ends the run as `escalated` without asking the model.
- Only the operator widens `tools.enabled`.

## 7. Tools and faults (`lib/engine/run.ts`)

| Tool | Kind | Arguments → result |
|---|---|---|
| `find_orders` | read | `{ customerId?, orderId? }` → `{ orders: [{ orderId, customerId, sku, qty, amountCents, createdAt, refunds }] }` (10 most recent in scope) |
| `create_order` | mutating | `{ customerId, sku, qty }` → `{ orderId, amountCents }` |
| `issue_refund` | mutating | `{ orderId, amountCents, reason }` → `{ refundId }` (`$push` onto the order) |
| `report` | control | `{ status: done \| failed \| escalated, summary }` — ends the run |

**The mock API refuses idempotency keys.** Arguments are checked strictly: an `idempotencyKey`,
or any unknown field, fails with `INVALID_ARGUMENT` and writes nothing. The tool descriptions say
"takes no idempotency key", and the DSL has no field that could add one.

Faults are a plan per run; only the injector reads it:

| Fault | Effect |
|---|---|
| `timeout_after_commit` | the write happens, then TIMEOUT (1.5 s live, 150 ms in evals) |
| `timeout_before_commit` | TIMEOUT, no write |
| `lookup_error` | `LOOKUP_UNAVAILABLE` |

`{ tool, call: n }` hits the n-th call to a tool; `{ tool, afterTimeout: true, times: n }` hits the
next n calls after an injected timeout. Picker → plan (T = the beat's mutating tool): `timeout
after saving` → T call 1 after commit (default) · `timeout before saving` → T call 1 before
commit · `after saving + lookup down` → the default plus 2 failing `find_orders` · `none`.

## 8. Cases and the evaluator (fixed code)

| Case | Setup / fault | Expect |
|---|---|---|
| `order.happy` | none | 1 order, done |
| `order.transient` | `create_order` times out before saving | 1 order, done (a retry is needed) |
| `refund.happy` | none | 1 refund, done |
| `refund.partial_x2` | two refunds (150 damaged, 175 missing) | 2 refunds, done |
| `refund.transient` | `issue_refund` times out before saving | 1 refund, done |
| `order.inc1`, `order.inc1+lookup` | incident #1's pattern (+ 2 lookups down) | 1 order, done (escalated accepted with lookups down) |
| `refund.xfer1`, `refund.xfer1+lookup` | incident #1's pattern on `issue_refund` | 1 refund, same |

Invariants: effects equal the expected count; the report agrees with the database (`done` ⇒
effects = expected, `failed` ⇒ 0, `escalated` ⇒ ≤ expected); the status is accepted. A policy's
suite is the cases whose tools it has enabled.

## 9. The demo (measured 2026-09-26 14:35, from reset)

| Beat | Input | What happened |
|---|---|---|
| `order-1` | Ana Ruiz (`c_2041`): 2 × Oat Milk 1L (`OAT-1L`) | timeout after saving → retried → 2 orders → incident #1 · v1 2/4 · no-retry rule rejected (failed `order.transient`, 0 orders) · tool note rejected (2 orders) · verify-before-retry promoted → v2 4/4 |
| `order-2` | Marcus Chen (`c_3317`): 1 × Sourdough Loaf | timeout → `find_orders` found → adopted → 1 order |
| `grant-issue_refund` | operator grants `issue_refund` → v3 | v3 7/9 · no-refund-retry rejected (failed `refund.transient`) · tool note rejected (2 refunds) · refund guardrail promoted → v4 9/9 |
| `refund-1` | Priya Nair (`c_1180`): $3.25 on seeded order `o_4H8M` | timeout → found → adopted → 1 refund |
| `order-n` (live only) | the next customer in `CUSTOMERS` | the picker's fault |

About 60 s end to end. Candidate names and losers come from the model each run.

## 10. Repo layout

```
app/page.tsx, app/components/   the page
app/api/{state,beat,reset}/     the three routes
lib/state.ts                    the GET /api/state contract
lib/engine/db.ts, llm.ts        Atlas client; OpenRouter client and the gated chat()
lib/engine/policy.ts            DSL (zod), apply, diff lines, hash
lib/engine/run.ts               tools, fault injector, the harness call wrapper, the executor
lib/engine/harness.ts           cases, evaluator, learning loop, screen, recall, beats, grant, reset
lib/engine/state.ts             runtime, change stream, ConsoleState assembly
scripts/                        reset.mts · beat.mts · eval.mts · ping.mts
fixtures/state/                 saved page states and their generator
```

## 11. Known gaps

- No Atlas Vector Search; recall is ordered live-first, not by similarity.
- `LLM_MODE=record|replay` is not implemented; the badge always says LIVE outside fixtures.
- Proposals vary between runs; a take can lack a rejection. Never stage one.
- The OpenRouter key is on a free, new-account tier: model calls are gated and back off on 429.
