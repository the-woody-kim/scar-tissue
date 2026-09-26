# Submission description

Numbers below are from the live run on 2026-09-26 at 14:35 (reset → four beats, about a minute
end to end). Re-check them against the recorded take before submitting.

---

## Scar Tissue

**Every agent failure becomes a tested upgrade to its own harness.**

Scar Tissue runs an LLM agent against a small grocery's orders in MongoDB Atlas. When a run
breaks an invariant — the order API times out after saving, and the default retry places a
second order — the harness, with no human in the loop:

1. records the incident and turns it into test cases, including a variant where the lookup it
   would need is down too;
2. recalls past incidents from Atlas with one `$lookup` aggregation that brings back the fixes
   each one produced — promoted and rejected;
3. asks a model for three candidate changes to its own policy, each in a different section —
   rules, guardrails, context or tool access — as typed JSON;
4. throws out any candidate that names the incident's customer, product or order ids, then
   runs the rest against a fixed evaluator it cannot edit. Each case is pass, fail or uncertain;
   uncertain never ships, and a candidate is promoted only if every case passes;
5. writes the winner to Atlas; the running agent picks it up through a **change stream** on
   `active_config`, pinned by hash, so what was tested is exactly what runs.

When the operator grants a new tool, the harness turns the scars that fit it into tests for that
tool and ships a fix before the tool's first call.

**In the demo (live, measured):** order #1 duplicates. "Never retry" is rejected — it fails
`order.transient`, where the timeout happened *before* saving and a retry was right (0 orders). A
tool note telling the agent to check is rejected too — the agent still ordered twice. "Verify
before retry" — look up the customer's recent orders, adopt a match, recheck twice if the lookup
fails, then halt — goes from 2/4 to 4/4 and ships as v2. Order #2 hits the same fault and the
guardrail adopts the saved order: one order. Then the agent is granted a refund tool it has never
used: its policy passes 7/9 before any refund has run, a "no refund retries" rule is rejected,
and a refund guardrail ships as v4 at 9/9. The first refund times out and is adopted: one refund.

Faults are data, so in the live demo a judge picks which one to inject.

**Why not idempotency keys?** When an API accepts one, use it. This one refuses them — like many
APIs an agent calls but doesn't own — so the harness has to find another way. The fix isn't the
point: the harness found it, tested it, and threw out worse ones by itself.

**MongoDB Atlas holds all of it:** the orders the agent acts on (refunds embedded, eval data
scoped per case and expired by TTL), every run's trace, incidents, versioned and hashed
policies with the incident and eval run that earned them, eval cases and results, and the active
config the runtime watches through a change stream.

The agent ends the demo as the same model it started as. Its harness is on version 4, and every
version has a test run that earned it.

**Why:** agents that take actions hit retry-after-success in production, and today the fix is a
human postmortem. Scar Tissue makes the postmortem executable and tested.

**Prior art:** RRSI (arXiv 2609.24972) showed on benchmarks that recursive harness edits overfit
unless they are regularized. Scar Tissue applies the same discipline live, one incident at a
time.

**What's next:** Atlas Vector Search over incidents so recall ranks by similarity; proposing
idempotency keys for tools that accept them.

**Built with:** MongoDB Atlas (change streams, aggregation with `$lookup`, TTL indexes),
OpenRouter (GPT-5.4 mini as the executor, GPT-6 Sol as the proposer), Next.js, TypeScript, zod.

Built on 09-26. The plan was written the night before; no code existed before the event.
