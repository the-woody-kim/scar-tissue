# Submission description

Numbers below are from the live run on 2026-09-26 at 14:35 (reset → four beats, about a minute
end to end). Re-check them against the recorded take before submitting.

---

## Scar Tissue

**Every agent failure becomes a tested upgrade to its own harness.**

An LLM agent takes a small grocery's orders in MongoDB Atlas. When a run breaks an invariant —
the order API times out after saving, and the default retry orders twice — the harness, with no
human in the loop:

1. turns the incident into test cases, including one where the lookup it would need is down too;
2. recalls past incidents, and the fixes each one produced (promoted and rejected), with one
   `$lookup` aggregation;
3. asks a model for three candidate changes to its own policy — rules, guardrails, context or
   tool access — as typed JSON;
4. drops any candidate that names the incident's ids, and runs the rest against a fixed evaluator
   it cannot edit. Each case is pass, fail or uncertain; only a candidate that passes every case
   is promoted;
5. writes the winner to Atlas. The running agent reloads it through a **change stream**, pinned
   by hash, so what was tested is what runs.

When the operator grants a new tool, the harness turns the scars that fit it into tests for that
tool and ships a fix before its first call.

**In the demo (live, measured):** order #1 duplicates. "Never retry" is rejected: it fails a case
where the timeout came *before* saving and a retry was right. A note telling the agent to check is
rejected: it still ordered twice. "Verify before retry" goes from 2/4 to 4/4 and ships as v2;
order #2 hits the same fault and adopts the saved order. Then the agent is granted a refund tool
it has never used. Its policy passes 7/9 before any refund runs, a "no refund retries" rule is
rejected, and a refund guardrail ships as v4 at 9/9. The first refund times out and is adopted:
one refund. Same model throughout; only the harness changed.

**Why not idempotency keys?** Use them when an API accepts them. This one doesn't, like many APIs
an agent calls but doesn't own. The point is that the harness found the fix, tested it, and threw
out worse ones by itself.

**MongoDB Atlas holds all of it:** the orders (eval data scoped per case and expired by TTL), run
traces, incidents, versioned and hashed policies linked to the eval runs that earned them, eval
cases and results, and the active config the runtime watches. Next: Atlas Vector Search so
recall ranks incidents by similarity.

**Every beat is one LangSmith trace:** the agent's model calls and tool calls, the eval scores,
and the brief the proposer saw with the candidates it returned. It is read-only: the harness never
reads a trace back, so the evaluator stays the only judge.

**Why it matters:** harnesses, not bigger models, are where agents get better — but an agent that
takes real actions can't learn by trial and error in production. Scar Tissue gives it a gate.
Agents that take actions hit retry-after-success in production, and today the fix is a human
postmortem. Scar Tissue makes the postmortem executable and tested. RRSI (arXiv 2609.24972)
showed recursive harness edits overfit unless regularized; this applies that discipline live, one
incident at a time.

**Built with:** MongoDB Atlas (change streams, `$lookup`, TTL indexes), OpenRouter (GPT-5.4 mini
executor, GPT-6 Sol proposer), LangSmith (tracing), Next.js, TypeScript, zod. Built on 09-26; only the plan existed
beforehand.
