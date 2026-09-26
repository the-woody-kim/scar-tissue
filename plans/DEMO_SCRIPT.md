# Demo script — Scar Tissue

Two versions: the **1-minute submission video** (required) and the **live finals demo** (only if
you make the top 6). Every number said aloud must be the one on screen in that take.

Measured on 2026-09-26, 14:35, from reset: order-1 ≈ 20 s (incident → three candidates → v2),
order-2 ≈ 6 s, grant ≈ 28 s (transfer → v4), refund-1 ≈ 6 s. Speed-ramp the two long ones with
a visible "4×".

---

## A. The 1-minute submission video

### Before recording

1. `npm run build && npm run start` (or the dev server), then **Reset demo** on the page — the
   first click in the video is the cold path. Header shows **LIVE** and `Policy v1 2/2`.
2. Browser full screen (⌃⌘F) at 110%, so the whole 1536 × 920 page is in frame. Notifications off.
3. ⌘⇧5, full screen, microphone on. Record the screen first; the voiceover can go over it after.
4. A second tab open on the Atlas Data Explorer, `scar_tissue.policies`, for the code shot.
5. The fault picker on its default, `timeout after saving`. Nobody else clicks the page.

### Script

| Time | On screen | Voiceover |
|---|---|---|
| 0:00–0:06 | Title over the page: **Scar Tissue — every failure, a tested upgrade** | "Agents that take actions repeat their mistakes. Scar Tissue turns each one into a tested fix." |
| 0:06–0:14 | Click **Run order #1**. Trace: `create_order` → TIMEOUT → retried → ok. Check turns red: *2 orders — expected 1* | "The order API times out after saving. The default retry orders twice." |
| 0:14–0:30 | (4×) Harness fills in: three candidates. **REJECTED** on the no-retry rule (fails `order.transient`), **REJECTED** on the tool note, **PROMOTED → v2** on the guardrail. Pill `v2 · 5/5`; *reloaded via change stream* | "The harness proposes three fixes. 'Never retry' fails a case where retrying is right. A note to the agent still orders twice. 'Verify before retry' passes every case, and the running agent reloads it from Atlas." |
| 0:30–0:35 | Click **Run order #2**. Trace: TIMEOUT → `find_orders` found → *adopted*. Check green: 1 | "Same fault, next customer: one order." |
| 0:35–0:47 | Click **Grant issue_refund** (4×): `v3 before · 9/11`, the scar transferred as refund tests, **PROMOTED → v4 · 11/11**. Click **Run refund #1** → adopted, one refund | "Now it gets a refund tool it has never used. It turns the order lesson into refund tests, fixes itself before the first refund, and that refund goes through once." |
| 0:47–0:56 | Atlas Data Explorer: the v4 document — `policy`, `hash`, `trigger`, `evalRunId`. Quick cut to `judge()` in `lib/engine/harness.ts` | "Every version is a MongoDB document with its hash, its trigger and the test run that earned it. The evaluator is code the agent can't touch." |
| 0:56–1:00 | End card: **Scar Tissue** · github.com/the-woody-kim/scar-tissue | "Scar Tissue. Every failure, a tested upgrade." |

**Say what the take shows.** Candidate names and which ones lose come from the model each run. If
the take differs (say, only one candidate is rejected), change the line to match — never stage
one. If nothing was rejected, record another take.

### After recording

- Trim to 60 s or less. Play it back **with sound**, all the way through.
- Upload it, then open the link in a private window.

---

## B. The live finals demo (top 6 on 09-26; .local on 09-30)

About 3 minutes; trim the story first.

**[0:00–0:30] Why** — "Agents that take real actions hit retry-after-success in production, and
the fix today is a human postmortem. I wanted the postmortem to be executable: an incident
becomes a test, the test gates the fix, and the fix travels to tools that haven't failed yet."

**[0:30–2:15] Live** — the four beats, slower. Then:
- *Hand the fault picker to a judge.* "Pick any fault. Only the injector knows what you chose."
  Press *Run another order* → one order, whatever they picked. If a pick fails the check, it's an
  incident: narrate the harness learning from it. Don't restart.
- Click the pill → the case grid. "Every number opens the cases behind it."
- *If a candidate was SCREENED:* "That one named the customer. It never ran — a fix has to work
  for everyone."

**[2:15–3:00] Close** — "The model writes candidates. Code decides. MongoDB remembers — including
what didn't work. The agent is the same model at the end as at the start. Its harness is on
version 4, and every version has a test run that earned it."

### Backup

- The recorded take. Switch line: "Here's the run from this afternoon —" and keep going.

### Q&A: "Why not idempotency keys?"

Get ahead of it. When "never retry" is rejected on screen, say: "This is why the answer isn't
'just stop retrying' — and why a key alone isn't the lesson."

If it's asked anyway (about 20 seconds):

> "If the API takes idempotency keys, use them — that's the right fix for this fault. But agents
> call tools they don't own, and many don't take keys. And the duplicate is the example, not the
> product. The product is the process: the harness proposed three fixes, and the evaluator threw
> out two. 'Never retry' broke the case where the timeout came before the save. The note to the
> agent still ordered twice. A human writing a postmortem makes those mistakes too. Then it carried
> the lesson to a refund tool before its first call. A key only fixes the endpoint it's added to."

Backing points:
- **Transfer:** `issue_refund` was at 9/11 before any refund ran; v4 shipped at 11/11.
- **Not only duplicates:** the invariants caught a $20 refund on a $9.75 order. It was caught, not
  learned from — say "caught".
- **Don't claim** the harness would pick a key-based fix: the policy format can't express one.
- **Next:** a second fault class that isn't a duplicate.

### Commands

```bash
npm run reset
```

```bash
npm run build && npm run start
```
