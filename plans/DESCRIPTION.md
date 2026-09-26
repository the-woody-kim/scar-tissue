# Submission description — draft

Final version written at feature freeze. Everything in brackets is measured from the recorded
take, never copied from the plan.

---

## Scar Tissue

**Every agent failure becomes a tested upgrade to its own harness.**

Scar Tissue runs a fight gym's ritual agent on MongoDB Atlas: it assigns each athlete's
pre-training ritual and logs their recovery after class. When a run breaks an invariant — the
gym's API times out after saving, and the default retry assigns the ritual a second time; like
many APIs an agent doesn't own, it takes no idempotency key — the harness:

1. records the incident and turns it into test cases, including a variant where a dependency
   fails too;
2. recalls similar incidents with **Atlas Vector Search**, joined with `$lookup` to the fixes that
   were promoted and the fixes that were rejected;
3. asks a model for candidate changes to its own policy — rules, guardrails, context or tool
   access — in a typed format;
4. screens out any candidate that names the incident's athlete, class or record — a fix has
   to work for everyone — then runs the rest against a fixed evaluator it cannot edit. Each
   case is pass, fail or uncertain; uncertain never ships, and a candidate is promoted only if
   every case passes;
5. hot-reloads the winner through a **change stream**, pinned by hash, so what was tested is
   exactly what runs.

When the operator grants a new tool, the harness recalls the scars that fit it, turns them into
tests for that tool, and ships a fix before the tool's first call.

**In the demo:** a duplicate pre-training ritual → "never retry" rejected (it failed [case]) → "check before
retrying" promoted ([a/b] → [b/b]) → the next athlete's is clean → a recovery-logging tool the
agent had never used is fixed before its first log ([c/d] → [d/d]). Faults are data, so in the live demo a
judge picks which one to inject.

**MongoDB Atlas holds all of it:** the rituals the agent acts on (recovery logs embedded), every run's
trace, incidents with [Automated Embeddings | Voyage AI] vectors, versioned and hashed policies,
eval cases and results, and the active config the runtime watches.

The agent ends the demo as the same model it started as. Its harness is on version [4], and every
version has a test run that earned it.

**Why:** a coach reads these records to decide whom to chase, and a duplicate sends them after an
athlete who did the work. Agents that write records hit retry-after-success in production — at a
gym, and in a D1 program keeping the same records for more staff — and today the fix is a human
postmortem. Scar Tissue makes the postmortem executable and tested. It started as a folder
of [41] lessons I wrote by hand after my own coding agents' mistakes.

**Prior art:** RRSI (arXiv 2609.24972) showed on benchmarks that recursive harness edits overfit
unless they are regularized. Scar Tissue applies the same discipline live, one production
incident at a time.

**What's next:** the same harness on a D1 athletics program's records; proposing idempotency keys for tools that accept them; invariants learned from a few labelled runs rather than
written per tool; the harness as a layer any agent's tool calls pass through.

**Built with:** MongoDB Atlas (Vector Search, change streams, [Automated Embeddings]), OpenRouter
([executor model], [proposer model]), [Voyage AI], Next.js, TypeScript.

Built on 09-26. The plan was written the night before; no code existed before the event.
