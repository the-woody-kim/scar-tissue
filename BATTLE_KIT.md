# BATTLE_KIT.md — the day on one page

Solo · 1-minute video · Statement One · The Malin Chelsea, 2026-09-26.
Keep this open on your phone. It is the only file that holds clock times.

## Tonight (09-25) — no app code

- [ ] Find the **Atlas Hackathon Sandbox** email. Create the project and cluster **through its
      link** (being a finalist depends on it). Pick AWS us-east-1. Note the tier.
- [ ] Database user with a generated password; network access for your current IP (add the venue's
      IP on arrival).
- [ ] Read, don't code: does this tier support Vector Search indexes, change streams and Automated
      Embeddings? Write the three answers into `SPEC.md` §12.
- [ ] Install **MongoDB Agent Skills** and connect the **MongoDB MCP Server** to the sandbox
      cluster in Claude Code — the guide's recommended start. Keep the connection string out of
      any file that will be committed.
- [ ] **Voyage AI:** account, API key, payment method (unlocks Tier 1 limits; no charge within the
      free tokens).
- [ ] **OpenRouter:** account and a personal key for before 10:30. Choose the executor (fast, tool
      calling) and proposer (strong, JSON-schema output) models and confirm both capabilities.
- [ ] **GitHub:** nothing yet. Create the public repo at T+0 so the first commit is dated 09-26.
- [ ] Recording test: ⌘⇧5 with the microphone on; play it back **with sound**.
- [ ] Charger, phone hotspot, sleep.

## Morning (before T+0)

- [ ] Check in on the Cerebral Valley platform — every credit code goes to checked-in emails,
      from 10:30.
- [ ] Ask the organisers: the exact submission time, and whether planning docs written the night
      before are fine (they contain no code).
- [ ] Add the venue IP to Atlas network access.
- [ ] Fill in the clock column below.

## Timeline

Hacking begins at **10:00** = T+0. Submission is **16:30** (confirmed), so the window is 6½ h.

| T+ | Clock | Phase | Done = |
|---|---|---|---|
| 0:00–0:20 | 10:00–10:20 | **Setup** — create-next-app (beside the folder, then copied in: `AGENTS.md` step 1), public repo, `.env.local`, collections, vector index first | `npm run reset` rebuilds a seeded, empty database |
| 0:20–1:30 | 10:20–11:30 | **Engine (Task 1a)** — tools, faults, policy engine, executor, trace | `npm run beat order-1` → 2 orders + trace in Atlas |
| 1:30–2:15 | 11:30–12:15 | **Evaluator (Task 1b)** — invariants, scopes, three outcomes | `npm run eval` prints v1's grid |
| 2:15–3:00 | 12:15–13:00 | **Learning loop (Task 1c)** — incident → cases → propose → eval → promote → reload | one REJECTED, one PROMOTED; order-2 clean |
| 3:00–3:15 | 13:00–13:15 | Eat, away from the screen | — |
| **3:15** | **13:15** | **HALFWAY GATE** | Is order-1 → v2 → order-2 working from the CLI? If no → cut the transfer (cut list #3) |
| 3:15–4:00 | 13:15–14:00 | **Memory + transfer (Task 2)** | grant → v4 promoted before any refund; refund-1 clean |
| 4:00–5:00 | 14:00–15:00 | **UI** — three panels + fault picker | each beat is one click and reads at 1080p |
| **5:00** | **15:00** | **FEATURE FREEZE** (= submission − 1:30) | nothing new after this |
| 5:00–5:15 | 15:00–15:15 | Wipe the DB; one full run with `LLM_MODE=record` | fixtures saved |
| 5:15–5:25 | 15:15–15:25 | **Backup video** | a complete take exists |
| 5:25–5:50 | 15:25–15:50 | Description + README | `plans/DESCRIPTION.md` final, numbers measured |
| 5:50–6:10 | 15:50–16:10 | Final live take, edit, **audio check** | 60 s or less, plays with sound |
| 6:10–6:20 | 16:10–16:20 | Submit on Cerebral Valley | submitted by **16:20** (= submission − 10 min) |

Freeze is 1:30 before the deadline rather than 2:00 because the video is one minute, not a pitch.

Codex builds every row but UI. The UI is Opus's (`AGENTS.md` → Who does what) and runs alongside
from T+0:20 against fixture state, so 4:00–5:00 is wiring to the live endpoint and polish, not
building the page.

## Cut list — in this order, when behind

1. The seed incident history — recall still shows the live incident and its attempts.
2. The fault picker — the video doesn't use it. Live, say faults are data and show the plan in
   `seed/beats.json`.
3. The transfer pre-flight — fallback: post-1 fails once, then recall fixes it in one attempt
   (the script has the fallback line).
4. The change stream — poll `active_config` every second, and label it "polling".
5. `context.toolNotes` in the engine — a candidate that uses it comes back `uncertain`.
6. The memory panel — fold it into the harness panel.

Never cut: the rejected candidate, the three outcomes, the hash on the pill.

## The one line

If you get one sentence with a judge, make it this one:

> "The agent is the same model at the end as at the start. Its harness is on version [4], and
> every version has a test run that earned it."

Say the version the demo actually reached.

## Anticipated judge questions

| They ask | You answer |
|---|---|
| "What's recursive about it?" | The one line, then: "It rewrites everything except the part that judges whether a rewrite is good. A system that can rewrite its own referee isn't self-improving — it's self-certifying." |
| "Isn't this a retry wrapper?" | "The retry wrapper caused the bug. The harness wrote the check from the trace, rejected its own first idea because a fixed test proved it wrong, and carried the lesson to a tool it had never used before that tool ever failed." |
| "Isn't it just memorising the incident?" | "It can't. A fixed screen throws out any fix that names the customer, the product or the order before it runs — a fix has to work for everyone. Then it has to pass cases it wasn't written for, and carry to a tool that hasn't failed yet. That's the overfitting problem RRSI, a paper from the 21st, found in self-improving harnesses. Scar Tissue handles it live, one incident at a time." |
| "Why not idempotency keys?" | "When the API takes one, use it — that's a fix this harness should propose. This one refuses them, like many APIs an agent calls but doesn't own; send one and the call fails. The fix isn't the point: the harness found it, tested it, and threw out a worse one by itself." |
| "Is it scripted?" | "Pick a fault." Hand them the picker and press *Run another order*. "Only the fault injector knows what you picked." (What each pick should do: `SPEC.md` §10.) |
| "What stops it learning something harmful?" | "It can only change a typed policy. The evaluator is code it can't touch. Uncertain never ships. It can narrow tool access, never widen it. Every version is hashed with the incident and the test run that earned it, and rollback is one pointer." |
| "What if the model proposes nonsense?" | "The evaluator rejects it, and the rejection is stored. The next time a similar incident comes up, the proposer sees what was already rejected, and why." |
| "Why MongoDB?" | "It holds the data the agent acts on, every trace, the versioned policy the runtime hot-reloads through a change stream, and the memory. One aggregation goes from a vector hit to the fixes it produced — promoted and rejected." |
| "How hard is this to recreate?" | "Fault injection, a policy engine, a three-outcome evaluator, cases derived from incidents and transferred to new tools, hash-pinned reload. The model writes candidates; everything that decides is code." |
| "Did you build this today?" | "Yes. I wrote the plan and the docs last night — no code. The first commit is from this morning." |
| "Limitations?" | "The invariants are written by hand per kind of tool. The faults are injected. Matching by fields can confuse two identical legitimate requests inside the window — request ids end to end are the next step." |
| "Impact?" | "Every team shipping agents that take actions — orders, refunds, payments — hits retry-after-success. Today the fix is a human postmortem. This makes the postmortem executable and tested." |

## Demo survival rules

1. Record from a wiped database — the first click in the video is the cold path.
2. Real-looking data only: Northside Grocer (fictional), named customers, real prices.
3. The backup take exists by 15:25 (T+5:25). If a live take breaks, use it; don't apologise.
4. Speed-ramp waits with a visible "4×". Never cut a result out of order.
5. Browser full screen (⌃⌘F) at 110%, so the whole 1536 × 920 page is in frame. Notifications off.
6. The video is 60 s. Rehearse to 55.

## Commits (judges can see the progression)

`setup: next app, atlas collections, seeds` → `engine: tools, faults, policy engine, executor` →
`evaluator: invariants and three outcomes` → `harness: incident to promoted policy` →
`memory: vector recall and transfer` → `ui: run, harness, memory panels` → `docs: readme`

## Submission (Cerebral Valley platform)

- [ ] Public GitHub repo link — open it in a private window to prove it's public
- [ ] 1-minute video showing the code and what it does — plays with video **and** audio
- [ ] Concise description (`plans/DESCRIPTION.md`)
- [ ] Built in the sandbox cluster
- [ ] Submitted by 16:20 (T+6:20)

## If you make the top 6

- Top 6 are announced on the day and demo live; a finalist demo is recorded on-site on 09-26.
- **MongoDB.local NYC, 2026-09-30, Pier 36:** be there 10:00–16:30 to exhibit and collect
  community votes; the top 3 demo on stage.
- The live version of the demo (with the origin story, the restart beat and the fault picker) is in
  `plans/DEMO_SCRIPT.md`.
