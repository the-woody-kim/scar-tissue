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
rejected: it still ordered twice. "Verify before retry" goes from 3/5 to 5/5 and ships as v2;
order #2 hits the same fault and adopts the saved order. Then the agent is granted a refund tool
it has never used. Its policy passes 9/11 before any refund runs, a "no refund retries" rule is
rejected, and a refund guardrail ships as v4 at 11/11. The first refund times out and is adopted:
one refund. Same model throughout; only the harness changed.

**Benchmarked on held-out tasks:** the same executor model, run live on 11 tasks × faults it never
learned from (3 runs each), was correct 36% of the time under the starting policy and 94% under the
policy it wrote for itself. Duplicate orders and refunds fell from 64% of runs to none. The two
learned runs that weren't correct hit the API's rate limit before finishing; every learned run that
finished was correct. Only the harness changed. Both arms are LangSmith experiments on one dataset,
compared side by side.

**Try to break it:** anyone can type their own request into the page. The agent runs it on the
active policy, and fixed invariants judge the result: no duplicate orders or refunds, no refund
above the order's total, and a report that matches the database. In testing, a customer talked
the agent into a $20 refund on a $9.75 order, and the check caught it. A broken check is stored as
an incident, but only the fault the evaluator has cases for is learned from, so a prompt can't talk
the harness into a new rule.

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

**Framework-agnostic:** the harness sits between the agent and its tools, not inside the agent.
Any agent that calls tools over MCP runs under the active policy; a Strands agent is included.

**Why it matters:** harnesses, not bigger models, are where agents get better — but an agent that
takes real actions can't learn by trial and error in production. Scar Tissue gives it a gate.
Agents that take actions hit retry-after-success in production, and today the fix is a human
postmortem. Scar Tissue makes the postmortem executable and tested.

**Built with:** MongoDB Atlas (change streams, `$lookup`, TTL indexes), OpenRouter (the latest GPT mini
as executor, the latest GPT Sol as proposer), LangSmith (tracing), MCP with Strands Agents, Next.js, TypeScript, zod.

**What existed before hacking began at 10:30:** the plan, four screen mockups, the Next.js
scaffold, and a static mock of the page that renders hand-written fixture JSON (commits `c362973`
and `a0f45b1`, 09:38). Everything that runs was built after 10:30: the engine, the evaluator, the
Atlas collections and change stream, the learning loop, the transfer to a new tool, the MCP server,
the tracing and the benchmark.
