# Demo script — Scar Tissue

Two versions: the **1-minute submission video** (required) and the **live finals demo** (only if
you make the top 6).

Every number said aloud must be one measured in that take. The numbers in brackets are
placeholders.

---

## A. The 1-minute submission video

The guide asks for a video "showing the code & functionality your team built today", with audio.
138 words of voiceover — brisk, but it fits.

### Before recording

1. `npm run reset` — a wiped database; the first click is the cold path.
2. `next start` running; browser full screen (⌃⌘F) at 110%, so the whole 1536 × 920 page is in
   frame; notifications off.
3. Header shows **LIVE**. Only use a REPLAY take as the backup, and leave the badge visible.
4. ⌘⇧5, full screen, microphone on. Record the screen first; the voiceover can go over it after.
5. Editor tabs ready for the code shot: `lib/harness/evaluator.ts`, and the Atlas Data Explorer
   open on `policies`.
6. The fault picker on its default, `timeout after saving`.

### Script

| Time | On screen | Voiceover |
|---|---|---|
| 0:00–0:07 | Title over the empty page: **Scar Tissue — every failure, a tested upgrade** | "I've hand-written [41] lessons after my coding agents' mistakes. Scar Tissue writes its own — and tests them first." |
| 0:07–0:15 | Click **Assign prep #1**. Trace: `assign_prep` → TIMEOUT → retried → ok. Check line turns red: *prep rituals for this class: 2 — expected 1* | "The gym's API times out after saving. The default retry assigns the ritual twice." |
| 0:15–0:30 | 02 fills in (speed-ramped, "4×" visible): incident → candidates → case dots → **REJECTED** on *never retry*, **PROMOTED** on *check before retrying*. Pill: `v2 · [4/4]`, then *reloaded via change stream* | "The harness proposes fixes. 'Never retry' fails a case where retrying is right: rejected. 'Check before retrying' passes every case: promoted. The running agent reloads it live." |
| 0:30–0:34 | Click **Assign prep #2**. Trace: TIMEOUT → *verify_before_retry → found → adopted*. Check line green: 1 | "Same fault, next athlete: one ritual." |
| 0:34–0:47 | Click **Grant log_recovery**. 03: hits with scores, the rejected attempt underneath, *transferred as tests*. 02: recovery candidate → **PROMOTED**, `v4 · [9/9]`. Click **Log recovery #1** → one recovery entry | "Now it gets a new tool: logging recovery after class. Atlas Vector Search recalls the scar, and the fix it rejected. It turns the lesson into a recovery test, fixes the policy, and the first log is written once." |
| 0:47–0:56 | Atlas Data Explorer: the v4 document — its four sections, `hash`, `trigger`, `evalRunId`. Quick cut to the invariants in `evaluator.ts` | "Each version is a MongoDB document with its hash, its incident and the test run that earned it. The evaluator is code the agent can't touch." |
| 0:56–1:00 | End card: **Scar Tissue** · repo URL | "Scar Tissue. Every failure, a tested upgrade." |

**The [41]:** 18 feedback + 23 environment lessons in the agent memory, counted 09-25. Recount
before recording, or drop the number.

**If the transfer was cut (cut list #3),** replace 0:34–0:47 with: click **Log recovery #1** → a
duplicate recovery entry → recall → one attempt → promoted. Voiceover: *"Same fault on the recovery tool. It
slips once — then Vector Search recalls the scar and the fix it rejected, and one attempt fixes
it."*

**If no candidate was rejected in a take,** don't stage one. Record another live take, or change
the line to what happened.

**If a candidate was SCREENED in the take,** leave it on screen; the voiceover doesn't change.

### After recording

- Trim to 60 s or less. Play it back **with sound**, all the way through.
- Upload it, then open the link in a private window.

---

## B. The live finals demo (top 6 on 09-26; .local on 09-30)

The length is set by the organisers — this runs about 3 minutes; trim the story first.

**[0:00–0:30] Where it came from**
"I built an iOS app with coding agents, and I kept a folder of lessons — one for every mistake
they made. [41] of them. One guard, a hook that blocks a single command, took three versions.
The first blocked too much: it fired on documentation that merely mentioned the command. The next
allowed anything it didn't understand. The fix was a third answer — *uncertain* — that never gets
the benefit of the doubt. That is the loop Scar Tissue automates, and its evaluator keeps the same
rule: uncertain never ships."

(Naming the app is your call. The story works without it; keep repo names and incident details
out.)

**[0:30–2:15] Live, narrated** — the four beats from the video, slower, then the restart beat:
- *Kill the server, run `next start` again.* "The runtime reads `active_config` on boot." The pill
  still shows v4 with the same hash.
- *Hand the fault picker to a judge.* "Pick any fault. Only the injector knows what you chose."
  Press *Assign another prep* → one ritual, whatever they picked (what each pick should do:
  `SPEC.md` §10). If a pick fails the check, it's an incident: narrate the harness learning from
  it. Don't restart.
- *If a candidate was SCREENED:* "That one named the athlete. It never ran — a fix has to work
  for everyone."
- Click the pill → the case grid. "Every number opens the cases behind it."

**[2:15–2:45] Why it matters**
"A coach reads these records to decide whom to chase; a duplicate sends them after an athlete who
did the work. Agents that write records — rituals here, a D1 program's next, payments anywhere —
all hit retry-after-success. Today the fix is a human postmortem and a patch. Scar Tissue makes the postmortem executable: an
incident becomes a test, the test gates the fix, and the fix travels to tools that haven't
failed yet. The model writes candidates. Code decides. MongoDB remembers — including what didn't
work."

**[2:45–3:00] Close**
"The agent is the same model at the end as at the start. Its harness is on version [4], and every
version has a test run that earned it. Scar Tissue."

### Backup

- The recorded take from T+5:25 (`~/scar-tissue/plans/backup.mov`).
- Switch line: "Here's the run from this afternoon —" and keep going.

### Commands

```bash
npm run reset
```

```bash
npm run build && npm run start
```
