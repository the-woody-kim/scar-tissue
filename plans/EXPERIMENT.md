# Experiment: the recursive loop, 5 times from a wiped database

Run on 2026-09-26 at 15:26–15:31 EDT, at commit `f1496f7`. LangSmith experiment
`recursive-gpt-6-astra-6c073544`, on the dataset `scar-tissue · four beats`. Rerun it with
`npm run experiment 5`, and set `EXPERIMENT_MODEL` to try another model.

## Setup

- **Each repetition:** reset, then order-1, order-2, grant `issue_refund`, then refund-1. Every run
  uses the fault "timeout after saving".
- **Model:** `openai/gpt-6-astra` as both executor and proposer, at temperature 0 with seed 7.
- **Provider:** routed only through OpenAI on OpenRouter, with no fallback.
- **Scoring:** fixed checks in code. No model grades anything, and the eval cases replay a script
  rather than calling the model.

## Results

The loop completed in **5 of 5** repetitions, and every check passed in every repetition.

| # | order-1 (v1) | order-1 candidates | v2 | order-2 | grant: before | grant candidates | v4 | refund-1 |
|---|---|---|---|---|---|---|---|---|
| 1 | 2 orders | A rule ✗ `order.transient` · B note ✗ `order.inc1` · C guardrail ✓ | `305cc3` | 1, adopted | 7/9 | A ✗ `refund.transient` · B ✗ `refund.xfer1` · C ✓ | `4e4f8a` | 1 |
| 2 | 2 orders | same | `305cc3` | 1, adopted | 7/9 | same | `4e4f8a` | 1 |
| 3 | 2 orders | same | `305cc3` | 1, adopted | 7/9 | same | `4e4f8a` | 1 |
| 4 | 2 orders | A rule ✗ `order.transient` · B ✗ **failed the schema** · C guardrail ✓ | `ec35cb` | 1, adopted | 7/9 | same as 1 | `f5d410` | 1 |
| 5 | 2 orders | same as 1 | `ec35cb` | 1, adopted | 7/9 | same as 1 | `f5d410` | 1 |

**Timing per repetition** (range across the five):

| Beat | Time |
|---|---|
| order-1, including the learning step | 18.1–19.8 s |
| order-2 | 5.5–6.2 s |
| grant, including transfer and learning | 18.4–20.9 s |
| refund-1 | 6.1–6.6 s |

## Findings

1. **The winning fix is the same idea every time.** In all 5 repetitions:
   - the evaluator rejected "stop retrying", because it fails the case where the timeout came
     *before* saving and a retry was right;
   - it rejected the note to the agent, because the order still went through twice;
   - it promoted "verify before retry", both for orders (v2) and for refunds (v4).
2. **The two learned versions differ in a single number.** The v2 and v4 guardrails are identical
   field for field except `withinSeconds`, how far back the lookup searches: 60 in repetitions 1–3,
   120 in 4–5. That one value is why there are 2 distinct hashes for each version, and it doesn't
   change behavior in these cases. The hash of what runs changes with it, so "what was tested is what
   runs" stays exact.
3. **Wording isn't repeatable, even at temperature 0 with a seed.** The candidate names changed on
   every repetition ("Stop Blind Retries", "Disable Automatic Order Retries", …), but the section and
   the verdict of each candidate didn't.
4. **One malformed candidate was caught.** In repetition 4, order-1's candidate B failed the policy
   schema and never ran. Two valid candidates remained, and the loop continued as designed.
5. **Transfer happened before any refund ran, every time.** The grant pre-flight measured v3 at 7/9,
   failing the two cases rebuilt from order-1's incident. v4 shipped at 9/9 before the first refund,
   and refund-1 then adopted the saved refund, making one refund.

## Limits of this experiment

- Five repetitions, one fault ("timeout after saving") and one model. The live demo's floating
  aliases (`~openai/gpt-mini-latest` executor, `~openai/gpt-sol-latest` proposer) were not
  re-measured here.
- The fixed checks score the loop's outcome. They say nothing about how the fix is worded.
