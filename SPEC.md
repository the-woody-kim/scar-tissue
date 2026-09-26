# SPEC.md — Scar Tissue

MongoDB Harness Engineering & Model Wrangling Hackathon · 2026-09-26 · solo · 1-minute video ·
Statement One: Recursive Harnessing

## 1. The problem (one sentence)

Agents that take real actions repeat operational mistakes — a retry after a timeout that had
already succeeded writes the same record twice — because nothing turns a failure into a tested, lasting
change to how the agent runs.

## 2. The solution

Scar Tissue runs an LLM agent that keeps a fight gym's training rituals in MongoDB Atlas — the
pre-training ritual each athlete is assigned for a class, and the recovery steps they log after
it. It:

1. **Runs** — the agent works through three tools on Atlas; a fixed fault injector can make a
   call time out after it commits, time out before it commits, or fail a lookup.
2. **Catches** — a fixed evaluator checks invariants after every run: one effect per request,
   and the agent's report matches the database. A violation becomes an incident.
3. **Derives tests** — the incident becomes an eval case, plus a variant in which a dependency
   fails as well.
4. **Recalls** — Atlas Vector Search finds similar past incidents, and `$lookup` joins each one to
   the fixes that were promoted and the fixes that were rejected.
5. **Proposes** — a strong model writes 2–3 candidate policies, most conservative to most
   targeted, in a typed format.
6. **Screens, tests and promotes** — a fixed leakage screen first throws out any candidate that
   names the incident (its athlete, class or record ids): a fix has to work for everyone. Every
   remaining candidate runs the whole suite. A candidate ships only if every case passes; the
   smallest change wins; rejected candidates are stored with the reason they lost.
7. **Reloads** — the running agent picks the new version up from a change stream on
   `active_config`, pinned by hash.
8. **Transfers** — when the operator grants a new tool, the harness recalls scars that fit it,
   turns them into tests for that tool, and ships a fix before the tool's first call.

Steps 2–8 run with no human input after a trigger.

**Why a gym.** A coach reads these records to decide whom to chase. A duplicated assignment is a
checklist nobody answers: the athlete shows as missing a ritual they did, and the coach chases
them for it. A duplicated recovery log counts one cool-down twice. A D1 athletics program keeps
the same records with more staff reading them, so the harness carries over unchanged.

**Prior art.** RRSI (arXiv 2609.24972, 2026-09-21) evolves agent harnesses against benchmarks and
shows the edits overfit to the tasks that caused them unless they are regularized: an edit
budget, a leakage screen, a no-regression floor, cost-aware acceptance. Scar Tissue applies the
same discipline live, one incident at a time: the smallest diff, a leakage screen, every case
passing, and transfer to a new tool before its first call.

## 3. Where MongoDB does the work

| Job | Atlas feature | In Scar Tissue |
|---|---|---|
| Data the agent acts on | documents, embedded arrays, TTL | `rituals` with embedded `recovery` logs; every document carries a `scope`; eval documents expire by TTL |
| Execution history | documents | `runs`: every step, the fault, and the policy clause that acted |
| Memory | Vector Search + Automated Embeddings (or Voyage AI) | `incidents` recalled by similarity; `$lookup` to promoted and rejected attempts in one aggregation |
| Versioned harness | documents, unique indexes | `policies`: version, hash, parent, status, diff, provenance |
| Evaluation | documents | `eval_cases` (seed / incident / transfer), `eval_runs` |
| Live reload | change streams | `active_config`, watched by the runtime |

Partners used as tools, not bolted on: **OpenRouter** (executor and proposer models) and
**Voyage AI** (embeddings, if Automated Embeddings isn't on the sandbox tier). Prizes go by
placement, with no per-sponsor tracks, so nothing else gets integrated.

## 4. UI surface map (one page, 1536 × 920)

If it isn't here, it doesn't get built. The page is 1536 × 920, centred: a 1080p screen recorded
with the browser full screen at 110% shows about 1745 × 980, so all of it is in frame.
Local mockup exports: [screen references](plans/README.md) in `plans/screens/`.
Four exports: Beats 1–3 and a judge's live pick. Where one differs from the requirements below,
the requirements win.
Original canvas: https://claude.ai/artifact/KKHVzgcZ41mduBGxbV4rXc (private).

- **Header:** `Scar Tissue` · active policy pill `v2 · 4/4 · 9f2c` (click → its case grid) ·
  `LIVE` / `REPLAY` · `reloaded 14:02:07 via change stream` · phase line
  RUN → CHECK → INCIDENT → RECALL → PROPOSE → EVAL → PROMOTE → RELOAD.
- **Beats (pre-filled, one click each):** `Assign prep #1` · `Assign prep #2` · `Grant log_recovery` ·
  `Log recovery #1`. `Reset` is a small link, off to the side.
- **Fault picker (live demo):** in the beats row, a `<select>` labelled *Fault for the next run* —
  `timeout after saving` (default) · `timeout before saving` · `after saving + lookup down` ·
  `none` — beside an `Assign another prep` button (the next athlete from `seed/athletes.json`).
  A pick applies to the next run only, then resets to the beat's default. The run panel's dashed
  tag shows what was injected. The video leaves it on the default.
- **01 · Run (left):** the latest live run. Task line; step rows
  `actor · tool · args · outcome · policy clause · ms`; an injected-fault tag on the row (UI
  only — never shown to the proposer); a check line such as
  `prep rituals for this class: 2 — expected 1` in red; the agent's report.
- **02 · Harness (middle):** the incident card (violated invariants, in plain words) → candidate
  cards: name, the section it changes (RULES / GUARDRAILS / CONTEXT / TOOLS), the diff, a row of
  named case dots, and a stamp `PROMOTED` or `REJECTED — failed prep.transient`. A candidate
  the leakage screen stopped is a one-line card, `SCREENED`, with the literals it named and no
  dots: it never ran. Below,
  the version history v1 → v4, each with a provenance chip: learned from incident #1 · granted
  by operator · learned by transfer.
- **03 · Memory (right):** the query text; the top 3 hits with score, summary and a `live` / `seed`
  chip; under each, its promoted and rejected attempts; then `transferred as tests: …`.

| Feature | Where it shows |
|---|---|
| Fault injector | 01 fault tag |
| Fault picker | the select in the beats row; 01 fault tag |
| Policy engine (retry, guardrail, limits) | 01 policy-clause column |
| Evaluator + invariants | 01 check line; 02 case dots |
| Incident capture, case derivation | 02 incident card; case names |
| Proposer | 02 candidate cards and diffs |
| Leakage screen | 02 `SCREENED` card, when a candidate names the incident |
| Promotion and rejection | 02 stamps; header pill; version history |
| Hash pinning, change stream | header pill hash; `reloaded … via change stream` |
| Vector recall + `$lookup` | 03 hits and their attempts |
| Transfer | 03 `transferred as tests`; 02 candidate for the new tool |
| Record / replay | header `LIVE` / `REPLAY` |
| Restart survival | header after a restart (finals only) |

## 5. Architecture

```
 Page (Next.js; polls GET /api/state every 500 ms)
   │  POST /api/beat  { beat: prep-1 | prep-2 | prep-n | grant-log_recovery | post-1, fault? }
   ▼
 Next.js server — one long-lived Node process (next start)
   runtime ─── holds currentPolicy ◄──────────────── change stream on active_config
   executor ── LLM (OpenRouter) ─► harness.call ─► policy engine ─► fault injector ─► tools
                                                                                        │
                                                        rituals + recovery logs (Atlas)
   evaluator (fixed) ─ invariants ─► pass | fail | uncertain ─► eval_runs
   learner ─── incident ─► cases ─► recall ($vectorSearch + $lookup) ─► proposer (OpenRouter)
                                           ─► screen ─► eval ─► promoter ─► policies ─► active_config
```

The promoter only writes to Atlas. The runtime learns about a new version only through the
change stream — that separation is what the reload label proves.

## 6. MVP scope

### In
1. Three business tools and a `report` control tool, all on Atlas
2. Fault injector: `timeout_after_commit`, `timeout_before_commit`, `lookup_error`
3. Policy engine: retry rules, the `verify_before_retry` guardrail, `maxPerRitual` limits, tool
   notes
4. Fixed evaluator with three outcomes; seed, incident and transfer cases
5. Proposer → eval → promote or reject → hash-pinned reload
6. Vector recall joined to attempts; six labelled seed incidents
7. Pre-flight transfer on a tool grant
8. One page, three panels; `LLM_MODE` record and replay
9. The fault picker — one select that overrides the next run's fault plan
10. The leakage screen — fixed code between the proposer and the evaluator

### Out
- ❌ Response-format drift as a second failure type — replaced by the lookup-failure variant,
  which deepens the one loop instead of widening it
- ❌ Idempotency keys or request ids end to end — the mock refuses them on purpose (§7b); proposing
  one for a tool that accepts it is the v2 answer, in the description
- ❌ LangChain / LangGraph / Vercel AI SDK agent loops — we own the loop
- ❌ ElevenLabs, LangSmith, Kiro — no sponsor tracks exist
- ❌ Deploying — a change stream needs a long-lived process; the video is the demo
- ❌ Auth, multiple agents, mobile layout, a model-routing panel
- ❌ The restart beat in the video — it's for the live finals demo

## 7. Locked schemas (lock before Task 1a; additive changes only after)

### 7a. Policy — the only thing the agent can change

```json
{
  "rules": [
    { "tool": "*", "on": "timeout", "action": "retry", "max": 2 }
  ],
  "guardrails": [
    {
      "kind": "verify_before_retry",
      "tool": "assign_prep",
      "lookup": {
        "tool": "find_rituals",
        "args": { "athleteId": "$args.athleteId" },
        "path": "rituals",
        "match": ["sessionId", "templateId"],
        "withinSeconds": 120
      },
      "onFound": "adopt",
      "onLookupError": { "recheck": 2, "then": "halt" }
    }
  ],
  "context": { "toolNotes": { "assign_prep": "Can time out after saving." } },
  "tools": { "enabled": ["find_rituals", "assign_prep"], "limits": {} }
}
```

- `rules[].action`: `retry` | `no_retry`; `on`: `timeout`; `max`: 0–3; `tool`: a tool name or `*`.
- `guardrails[].kind`: `verify_before_retry` only. `lookup.path` is a dot path where `*` flattens
  an array (`rituals.*.recovery`). `match` compares the named fields of each found record with
  the original call's arguments. `onFound`: `adopt` — return the found record as the call's
  result. `onLookupError.then`: `halt` | `proceed` (`proceed` is allowed; the evaluator has to
  catch it).
- `context.toolNotes`: at most 200 characters per tool, added to the executor's system prompt.
- `tools.enabled` must be a subset of the parent's; `tools.limits` can only get stricter. Only the
  operator widens (§8).
- **A retry is any repeat of a mutating call with the same arguments after that call timed out —
  whether the rule engine or the LLM initiates it.** Guardrails apply either way.

### 7b. Tools

| Tool | Kind | Arguments → result |
|---|---|---|
| `find_rituals` | read | `{ athleteId? , ritualId? }` → `{ rituals: [{ ritualId, athleteId, sessionId, templateId, createdAt, recovery: [{ entryId, stepId, status, createdAt }] }] }` (10 most recent) |
| `assign_prep` | mutating | `{ athleteId, sessionId, templateId }` → `{ ritualId, opensAt }` — the athlete's pre-training ritual for one class |
| `log_recovery` | mutating | `{ ritualId, stepId, status }` → `{ entryId }` (`$push` onto the ritual's `recovery`); `status`: `done` \| `not_done` \| `adjust` |
| `report` | control | `{ status: "done" \| "failed" \| "escalated", summary }` — ends the run |

A guardrail halt ends the run as `escalated` without asking the LLM.

**The mock API refuses idempotency keys.** Like many APIs an agent calls but doesn't own, the
mutating tools take no idempotency key or request id. Arguments are validated strictly (zod
`.strict()`), so an `idempotencyKey`, or any other unknown argument, fails with
`INVALID_ARGUMENT: unknown field idempotencyKey` and writes nothing. The tool descriptions the
executor and the recall query see say so — `assign_prep — mutating; assigns an athlete's pre-training ritual for a
class; can time out; takes no idempotency key.` — and the policy DSL has no field that could add one. That is why
the harness has to check before retrying rather than let the server deduplicate.

### 7c. Faults (fixed code; one plan per run)

```json
[
  { "tool": "assign_prep", "call": 1, "fault": "timeout_after_commit" },
  { "tool": "find_rituals", "afterTimeout": true, "times": 2, "fault": "lookup_error" }
]
```

- `timeout_after_commit` — the write happens, then `TIMEOUT` after 1.5 s
- `timeout_before_commit` — `TIMEOUT`, and no write
- `lookup_error` — `LOOKUP_UNAVAILABLE`

`call` is the 1-based index of calls to that tool within the run. `afterTimeout` + `times` hits the
next `times` calls to that tool after an injected timeout, so "lookup down" lands on the
verification whether or not the agent looked something up first.

**Fault picker options → plans** (`T` = the beat's mutating tool):

| Option | Plan |
|---|---|
| `timeout after saving` (default) | `T` call 1: `timeout_after_commit` |
| `timeout before saving` | `T` call 1: `timeout_before_commit` |
| `after saving + lookup down` | `T` call 1: `timeout_after_commit`; the next 2 `find_rituals` calls: `lookup_error` |
| `none` | no faults |

Only the injector reads the pick. Nothing else can tell a picked fault from a beat's default.

### 7d. Collections (database `scar_tissue`)

```jsonc
// rituals — every business document is scoped: "live", or "<evalRunId>/<caseId>"
{ "_id": "rt_7Q2K", "scope": "live", "athleteId": "ath_2041", "sessionId": "s_tue1800",
  "templateId": "prep-nogi", "recovery": [], "createdAt": "…", "expiresAt": null }

// runs
{ "_id": "r_…", "scope": "live", "beat": "prep-1", "task": { "kind": "assign_prep", "…": "…" },
  "policyVersion": 1, "policyHash": "sha256:…",
  "steps": [{ "i": 2, "actor": "harness", "tool": "assign_prep", "args": {},
              "outcome": "ok | timeout | lookup_error | adopted | blocked | halted",
              "clause": "rules[0]", "fault": "timeout_after_commit", "ms": 1504 }],
  "status": "done", "report": "Prep ritual assigned.",
  "check": { "effects": 2, "expected": 1, "ok": false, "violations": ["…"] },
  "startedAt": "…", "ms": 4210 }

// incidents
{ "_id": "inc_1", "origin": "live | seed", "runId": "r_…", "tool": "assign_prep",
  "toolKind": "mutating",
  "pattern": [{ "tool": "assign_prep", "call": 1, "fault": "timeout_after_commit" }],
  "violations": ["2 prep rituals for 1 request", "reported done"],
  "summary": "assign_prep timed out after the ritual was saved; the retry assigned it again.",
  "embedding": [/* omitted with Automated Embeddings */], "createdAt": "…" }

// policies
{ "_id": "p_2", "version": 2, "hash": "sha256:9f2c…", "parent": 1,
  "status": "active | candidate | rejected | superseded",
  "origin": "baseline | learned | operator",
  "trigger": { "kind": "incident | tool_grant", "incidentId": "inc_1", "recalled": ["inc_…"] },
  "rules": [], "guardrails": [], "context": {}, "tools": {},
  "diff": [{ "section": "guardrails", "op": "add", "path": "guardrails[0]", "value": {} }],
  "rationale": "…", "proposer": { "model": "…", "candidate": 2 },
  "evalRunId": "e_…", "result": { "pass": 4, "fail": 0, "uncertain": 0, "failedCases": [] },
  // screened instead: "status": "rejected", "evalRunId": null, "result": { "screened": ["ath_2041", "s_tue1800"] }
  "createdAt": "…", "promotedAt": "…" }

// eval_cases
{ "_id": "prep.transient", "origin": "seed | incident | transfer",
  "sourceIncidentId": null, "tools": ["find_rituals", "assign_prep"],
  "setup": { "rituals": [] },   // post cases pre-create the ritual they log against
  "tasks": [{ "kind": "assign_prep", "athleteId": "ath_eval", "sessionId": "s_eval", "templateId": "prep-nogi" }],
  "faults": [{ "tool": "assign_prep", "call": 1, "fault": "timeout_before_commit" }],
  "expect": { "effects": 1, "accept": ["done"] } }

// eval_runs
{ "_id": "e_…", "policyHash": "sha256:…", "label": "v1 | candidate 1 | …",
  "cases": [{ "caseId": "…", "outcome": "pass | fail | uncertain", "detail": "2 rituals, reported done", "runId": "r_…" }],
  "pass": 3, "fail": 1, "uncertain": 0, "startedAt": "…", "ms": 9120 }

// active_config — exactly one document
{ "_id": "active", "version": 2, "hash": "sha256:9f2c…", "evalRunId": "e_…", "promotedAt": "…" }
```

Indexes: `rituals {scope, athleteId, createdAt}`; `rituals {expiresAt}` TTL; `runs {scope, startedAt}`;
`policies {version}` unique; `policies {hash}`; `policies {trigger.incidentId}`; a vector index
`incidents_vec` on `embedding` (or on `summary` with Automated Embeddings) with filter fields
`toolKind` and `origin`.

## 8. Evaluator, cases and promotion (fixed code)

**Invariants, checked in the case's scope after every run:**
1. `effects` — records created == `expect.effects`
2. `report` — the final status agrees with the database: `done` ⇒ effects == expected;
   `failed` ⇒ effects == 0; `escalated` ⇒ effects ≤ expected
3. `accept` — the final status is in `expect.accept`

**Outcome:** `pass` if all three hold; `fail` if any is violated; `uncertain` if the run threw
outside the fault plan, hit the 20 s case timeout, never reported, or the policy failed
validation.

**Where cases come from, and their names.** A case id is exactly what the UI shows, ASCII only,
and short enough that the longest fits a chip in a three-column grid (≤ 19 characters).
`<domain>` is the tool the case exercises: `prep` = `assign_prep`, `post` = `log_recovery`.

- **seed** — written by hand before any run; read-only:
  - `prep.happy` — no fault
  - `prep.transient` — `assign_prep` times out *before* committing; the retry is needed
  - `post.happy` — no fault
  - `post.two_steps` — two different recovery steps logged on one ritual, both legitimate
  - `post.transient` — `log_recovery` times out before committing
- **incident** — insert-only. `<domain>.inc<N>` is incident #N's pattern, inferred from evidence
  (a timed-out mutating call plus an extra record ⇒ `timeout_after_commit` on that call), and
  `<domain>.inc<N>+lookup` adds the next two `find_rituals` calls failing (the
  `after saving + lookup down` plan in §7c).
  Incident #1 gives `prep.inc1` and `prep.inc1+lookup`.
- **transfer** — insert-only. `<domain>.xfer<N>` is incident #N's pattern mapped onto the newly
  granted tool, plus `<domain>.xfer<N>+lookup`. Granting `log_recovery` after incident #1 gives
  `post.xfer1` and `post.xfer1+lookup`.

A policy's suite = the cases whose tools are all enabled in that policy.

**Promotion:** a candidate is promoted if it has 0 fail and 0 uncertain, and more passes than the
active policy on the same suite. On a tie, the fewest changed leaves in the diff wins. The old
active version becomes `superseded`; losers become `rejected` with `failedCases`.

**Leakage screen** (`lib/harness/screen.ts`, fixed; runs before any case). The literals are the
string values in the trigger incident's run: athlete ids and names, session and template ids, ritual and entry ids,
from the task, the step arguments and the results, plus every case id. For a transfer, the
recalled incidents' runs count too. A candidate is screened out if any string in its diff
contains a literal, ignoring case; `$args.*` references are not literals. Numbers are not
screened: `max: 2` and `withinSeconds: 120` are policy, not memory. A screened candidate is
stored as `rejected` with `result.screened` and no eval run, and recall shows it with the other
attempts. RRSI's leakage screen is a critic model; this one is string matching, so the proposer
can't argue its way past it.

**Expected numbers** (for rehearsal only — the script quotes what is measured live):

| Moment | Suite | Before | Candidates |
|---|---|---|---|
| after prep-1 | `prep.happy`, `prep.transient`, `prep.inc1`, `prep.inc1+lookup` | v1: 2/4 | `no_retry` 1/4 → rejected (`prep.transient`: 0 rituals; `prep.inc1`: reported failed with 1 ritual saved) · `verify_before_retry` 4/4 → promoted |
| after the grant | those 4 + `post.happy`, `post.two_steps`, `post.transient`, `post.xfer1`, `post.xfer1+lookup` | v3: 7/9 | `maxPerRitual: 1` → rejected (`post.two_steps`) · `verify_before_retry` on `log_recovery` 9/9 → promoted |

The most targeted candidate may name the incident — e.g. a tool note, "Prep for ath_2041
(s_tue1800) can time out after saving; don't retry it." — and is then screened before it runs.
Whether one appears depends on the proposer; never stage one.

## 9. The autonomy contract

After a trigger, no human input until the reload: run → check → incident → derive → recall →
propose → screen → evaluate → promote or reject → reload. On a tool grant: evaluate → recall →
transfer → propose → screen → evaluate → promote → reload.

The operator owns: the trigger, tool grants, the evaluator and invariants, seed cases, the fault
injector. The harness owns: the `policies` collection, and nothing else.

## 10. Demo scenario — Kestrel MMA (fictional)

A fight gym's ritual agent. Before a class it assigns each athlete that class's pre-training
ritual (`assign_prep`); after class it logs the recovery steps the athlete reports
(`log_recovery`). Ritual contents are placeholders, not prescribed training. No real gym, coach
or athlete appears anywhere in the repo, the video or the description.

| Beat | Input | Fault plan | What should happen |
|---|---|---|---|
| `prep-1` | Ana Ruiz (`ath_2041`): ritual `prep-nogi` for Tue 18:00 No-Gi (`s_tue1800`) | `assign_prep` call 1: `timeout_after_commit` | v1 retries → 2 prep rituals → incident → v2 promoted |
| `prep-2` | Marcus Chen (`ath_3317`): ritual `prep-fund` for Wed 07:00 Fundamentals (`s_wed0700`) | same | v2 verifies, finds the saved ritual, adopts it → 1 ritual |
| `grant-log_recovery` | operator grants `log_recovery` → v3 | — | pre-flight: recall → transfer cases → v4 promoted |
| `post-1` | Priya Nair (`ath_1180`), seeded ritual for Tue 18:00 No-Gi: after class she reports her cool-down done → `cooldown: done` | `log_recovery` call 1: `timeout_after_commit` | v4 verifies, finds the entry → 1 entry |
| `prep-n` (live only) | the next athlete in `seed/athletes.json`, for their next class | the fault picker's pick | see below |

**The fault picker, live only.** After beat 2 — or at the end — hand it to a judge and press
`Assign another prep`. Under v2 and later, every option should end with one prep ritual:

| Pick | Expected |
|---|---|
| timeout after saving | lookup finds the ritual → adopted → 1 ritual, done |
| timeout before saving | lookup finds nothing → retried → 1 ritual, done |
| after saving + lookup down | rechecks, then adopts (1 ritual, done) — or halts (1 ritual, escalated) if the promoted rule rechecks fewer times than the lookup fails |
| none | 1 ritual, done |

A pick that fails the check is an incident, and the harness learns from it on screen. Narrate it;
don't restart. Rehearse all four picks before recording.

Seed incidents (`origin: "seed"`, from other systems, no executable pattern — they exist so
recall has something to rank): a class reminder sent twice after a timeout · a mat spot reserved
twice after a slow replica read · an empty class schedule during an outage read as "no classes" ·
a membership charge retried five times into a card lockout · two "J. Smith" athletes, first one
picked · a belt-rank field renamed and written as null.

**Recall** (sketch):

```js
[
  { $vectorSearch: { index: "incidents_vec", path: "embedding", queryVector,
                     numCandidates: 50, limit: 3, filter: { toolKind: "mutating" } } },
  { $project: { summary: 1, tool: 1, pattern: 1, origin: 1,
                score: { $meta: "vectorSearchScore" } } },
  { $lookup: { from: "policies", localField: "_id", foreignField: "trigger.incidentId",
               as: "attempts",
               pipeline: [{ $project: { version: 1, status: 1, diff: 1, "result.failedCases": 1 } }] } }
]
```

Vector Search indexes are eventually consistent: after inserting an incident, wait until a query
returns it before recalling. An empty recall is a failed query, not an empty memory — the seed
history must always come back.

## 11. Repo layout

```
app/page.tsx                  the one page (Opus)
app/components/               panels, cards, case chips (Opus)
app/api/beat/route.ts         POST — runs a beat, returns at once
app/api/state/route.ts        GET — everything the page shows
lib/state.ts                  the GET /api/state type — the contract between the page and the engine
lib/db.ts                     client, collections, indexes
lib/tools/                    findRituals.ts · assignPrep.ts · logRecovery.ts · report.ts
lib/faults.ts                 fault injector (fixed)
lib/policy/                   schema.ts (zod) · engine.ts · hash.ts · diff.ts
lib/agent/executor.ts         the LLM loop
lib/harness/                  evaluator.ts (fixed) · screen.ts (fixed) · cases.ts · incidents.ts ·
                              recall.ts · proposer.ts · promoter.ts · runtime.ts (change stream)
lib/llm.ts                    OpenRouter client + record/replay
scripts/                      reset.ts · beat.ts · eval.ts
seed/                         cases.json · incidents.json · beats.json · rituals.json ·
                              athletes.json · sessions.json
fixtures/llm/                 recorded responses
fixtures/state/               one state per beat, for building the page before the engine (Opus)
```

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The sandbox tier lacks change streams | Low–Med | Med | Poll `active_config` every second; the label says "polling" |
| Automated Embeddings unavailable | Med | Low | Voyage AI API; key made tonight |
| A new incident isn't searchable yet | Med | High | Wait for a query that returns it; the seed history is the control |
| The proposer emits invalid JSON or DSL | Med | Med | JSON-schema output + zod; invalid → uncertain; ask for 3 candidates |
| No candidate trips the leakage screen | Med | Low | Fine — the screen is in the code and the Q&A. Never stage one |
| No rejection happens in a take | Med | Med | Ask for a range from most conservative to most targeted. Never stage one — record another live take |
| A case flips between identical runs | Low | Med | Temperature 0; treat a flip as a bug in the case, not a result |
| Eval too slow for the video | Med | Med | Fast executor, concurrency 8, 20 s case timeout; speed-ramp waits in the edit with a visible "4×" |
| OpenRouter credits only from 10:30 | High | Low | Personal key before then |
| Venue Wi-Fi | Med | High | Phone hotspot; replay mode for the backup take (UI shows REPLAY) |
| A judge's pick fails the check live | Low | Med | It's an incident — the harness learns from it on screen. Narrate it; never restart. Rehearse all four picks |
| Scope creep | High | High | Scope gate in `AGENTS.md`; cut list in `BATTLE_KIT.md` |

## 13. Definition of done

- [ ] Every item in `AGENTS.md` → Demo target
- [ ] `npm run reset && npm run beat prep-1` works from an empty database
- [ ] The video shows only live runs, or says REPLAY on screen
- [ ] Under v2, each fault-picker option ends with one prep ritual (rehearsed)
