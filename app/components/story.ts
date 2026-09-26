import type { CandidateView, ConsoleState, FaultPick, RunView } from "@/lib/state";

// What the dashboard says about the state it was handed. Everything here is derived from
// ConsoleState — no beat names, no picked faults.

export const PICK_LABEL: Record<FaultPick, string> = {
  after_commit: "timeout after saving",
  before_commit: "timeout before saving",
  after_commit_lookup_down: "after saving + lookup down",
  none: "none",
};

// learn: a failed check became an incident and fixes. grant: the operator added a tool and the
// harness fixed it before its first call. clean: a run with nothing to learn. running: a run whose
// check hasn't landed yet. idle: nothing has run.
export type Mode = "idle" | "running" | "learn" | "grant" | "clean";

// done: grey · fail: red · win: accent · now: white, in progress · wait: dark, not reached
export type Tone = "done" | "fail" | "win" | "now" | "wait";

export interface Tile {
  phase: string;
  tone: Tone;
  value: string;
  unit: string;
  caption: string;
}

export interface Segment {
  t: string;
  tone?: "fail" | "win";
}

export interface Story {
  mode: Mode;
  eyebrow: string;
  title: string;
  viewing: number; // index into state.beats; -1 before the first beat
  note: Segment[]; // the viewed beat's result, for the sidebar
  headline: Segment[];
  tiles: Tile[];
  run: RunView | null; // the run this beat made
  lastRun: RunView | null; // an earlier run, folded away
  winner: CandidateView | null;
  losers: CandidateView[];
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const count = (n: number) => (n === 1 ? "one fix" : `${n} fixes`);

function list(items: Segment[]): Segment[] {
  return items.flatMap((s, i) => (i === 0 ? [s] : [{ t: i === items.length - 1 ? " and " : ", " }, s]));
}

export function tell(state: ConsoleState): Story {
  const h = state.harness;
  const run = state.run;
  const candidates = h.kind === "incident" || h.kind === "grant" ? h.candidates : [];
  const winner = candidates.find((c) => c.status === "promoted") ?? null;
  const losers = [
    ...candidates.filter((c) => c.status === "rejected"),
    ...candidates.filter((c) => c.status === "screened"),
  ];

  // A grant makes no run, so the run on screen is from before it when its policy predates the grant.
  const runPredatesGrant = h.kind === "grant" && run !== null && run.policy.version < h.toVersion;
  const mode: Mode =
    run && !run.check
      ? "running"
      : h.kind === "incident"
        ? "learn"
        : h.kind === "grant"
          ? runPredatesGrant ? "grant" : "clean"
          : run
            ? "clean"
            : "idle";

  // A visitor's prompt belongs to no beat, so no beat is highlighted while it's on screen.
  const typed = !!run?.task.prompt && (mode === "clean" || mode === "learn" || state.running === "prompt");
  const viewing = typed
    ? -1
    : state.beats.findIndex((b) => b.id === state.running) >= 0
      ? state.beats.findIndex((b) => b.id === state.running)
      : state.beats.map((b) => b.status).lastIndexOf("done");
  const eyebrow = state.running
    ? "Running"
    : typed
      ? "Visitor request"
      : run?.picked && mode === "clean"
      ? "Live pick"
      : viewing >= 0
        ? `Beat ${viewing + 1} of ${state.beats.length}`
        : "Not started";

  const title = mode === "grant" && h.kind === "grant" ? `Grant ${h.tool}` : mode === "idle" ? "Ready" : run?.title ?? "Ready";

  // The one-line result under the viewed beat in the sidebar.
  const check = run?.check;
  const learned = winner ? [{ t: " · learned " }, { t: `v${winner.promotedTo}`, tone: "win" as const }] : [];
  const note: Segment[] =
    mode === "grant"
      ? [{ t: "transfer" }, ...(winner ? [{ t: " · " }, { t: `v${winner.promotedTo}`, tone: "win" as const }] : [])]
      : mode === "running"
        ? [{ t: "Running…" }]
        : check
          ? [{ t: plural(check.effects, check.noun), tone: check.ok ? "win" : "fail" }, ...(mode === "learn" ? learned : [{ t: ` · on v${run!.policy.version}` }])]
          : [];

  return {
    mode,
    eyebrow,
    title,
    viewing,
    note,
    headline: headline(state, mode, winner, losers),
    tiles: tiles(state, mode, winner, candidates),
    run: mode === "grant" ? null : run,
    lastRun: mode === "grant" ? run : null,
    winner,
    losers,
  };
}

function actions(winner: CandidateView | null, losers: CandidateView[], keptVersion: number): Segment[] {
  const rejected = losers.filter((c) => c.status === "rejected").length;
  const screened = losers.filter((c) => c.status === "screened").length;
  const parts: Segment[] = [];
  if (screened) parts.push({ t: `screened ${count(screened)}` });
  if (rejected) parts.push({ t: `rejected ${count(rejected)}` });
  parts.push(
    winner
      ? { t: `promoted policy v${winner.promotedTo}`, tone: "win" }
      : { t: `kept v${keptVersion}: no fix passed every case`, tone: "fail" },
  );
  return list(parts);
}

function headline(state: ConsoleState, mode: Mode, winner: CandidateView | null, losers: CandidateView[]): Segment[] {
  const { run, harness: h } = state;
  if (mode === "idle") {
    return [{ t: "Each run is checked. A failed check becomes an incident, and the incident becomes tests." }];
  }
  if (mode === "running" && run) {
    return [{ t: `${run.title} is running on policy v${run.policy.version}.` }];
  }
  if (mode === "grant" && h.kind === "grant") {
    const t = state.memory.kind === "recall" ? state.memory.transferred : undefined;
    return [
      { t: `The operator granted ${h.tool}. ` },
      { t: t ? `Before its first call, incident #${t.incident} became tests, and the harness ` : "The harness " },
      ...actions(winner, losers, h.before.version),
      { t: "." },
    ];
  }
  const check = run?.check;
  if (!run || !check) return [];
  const made = { t: plural(check.effects, check.noun), tone: check.ok ? ("win" as const) : ("fail" as const) };
  if (mode === "learn" && h.kind === "incident") {
    return [
      { t: `${run.title} made ` },
      made,
      { t: ` for one request, expected ${check.expected}. The harness ` },
      ...actions(winner, losers, h.before.version),
      { t: "." },
    ];
  }
  if (!check.ok && check.violations?.length) {
    return [{ t: `${run.title} broke a fixed check: ` }, { t: check.violations.join("; "), tone: "fail" }, { t: ". Stored as an incident; nothing was learned from it." }];
  }
  if (!check.ok) {
    return [{ t: `${run.title} made ` }, made, { t: ` for one request, expected ${check.expected}. Nothing was learned from it.` }];
  }
  const tail =
    h.kind === "clean" && h.compare
      ? ` The same fault made ${plural(h.compare.before.effects, h.compare.before.noun)} on v${h.compare.before.version}.`
      : run.picked
        ? ` The fault was picked live: ${PICK_LABEL[run.picked]}.`
        : "";
  return [{ t: `${run.title} made ` }, made, { t: `, as expected, on policy v${run.policy.version}.${tail}` }];
}

function tiles(state: ConsoleState, mode: Mode, winner: CandidateView | null, candidates: CandidateView[]): Tile[] {
  const { run, harness: h, memory, policy, reload } = state;
  const reloaded = reload ? `reloaded ${reload.at}` : "reload pending";

  const evalTile: Tile = (() => {
    const ran = candidates.filter((c) => c.status !== "screened").length;
    const rejected = candidates.filter((c) => c.status === "rejected").length;
    const screened = candidates.filter((c) => c.status === "screened").length;
    const rest = [rejected && `${rejected} rejected`, screened && `${screened} screened`].filter(Boolean).join(" · ");
    return {
      phase: "Propose · Eval",
      tone: "done",
      value: `${winner ? 1 : 0} of ${candidates.length}`,
      unit: "passed",
      caption: rest || `${ran} ran`,
    };
  })();

  const promoteTile: Tile = winner
    ? {
        phase: "Promote · Reload",
        tone: "win",
        value: `v${winner.promotedTo}`,
        unit: "live",
        caption: `${winner.cases.filter((c) => c.outcome === "pass").length}/${winner.cases.length} cases · ${reloaded}`,
      }
    : {
        phase: "Promote · Reload",
        tone: "fail",
        value: `v${policy.version}`,
        unit: "kept",
        caption: "No fix passed every case",
      };

  const heldTile: Tile = {
    phase: "Policy",
    tone: mode === "idle" ? "wait" : "done",
    value: `v${policy.version}`,
    unit: mode === "idle" ? "baseline" : "held",
    caption: `${policy.pass}/${policy.total} cases pass`,
  };

  if (mode === "idle") {
    const next = state.beats.find((b) => b.status === "next");
    return [
      { phase: "Run · Check", tone: "wait", value: "—", unit: "no run yet", caption: next ? `Start with ${next.label.toLowerCase()}` : "Nothing has run" },
      {
        phase: "Incident · Recall",
        tone: "wait",
        value: "—",
        unit: "no incidents",
        caption: memory.kind === "stored" ? `${memory.counts.seed} seed incidents on record` : "Nothing on record",
      },
      { phase: "Propose · Eval", tone: "wait", value: "—", unit: "no fixes", caption: "Nothing to fix yet" },
      heldTile,
    ];
  }

  if (mode === "running" && run) {
    return [
      { phase: "Run · Check", tone: "now", value: String(run.steps.length), unit: run.steps.length === 1 ? "call" : "calls", caption: `${run.title} on v${run.policy.version}` },
      { phase: "Incident · Recall", tone: "wait", value: "—", unit: "waiting", caption: "Waits for the check" },
      { phase: "Propose · Eval", tone: "wait", value: "—", unit: "waiting", caption: "Only if the check fails" },
      { ...heldTile, tone: "wait", caption: `${policy.pass}/${policy.total} cases · in force` },
    ];
  }

  if (mode === "grant" && h.kind === "grant") {
    const t = memory.kind === "recall" ? memory.transferred : undefined;
    const top = memory.kind === "recall" ? memory.hits[0]?.score : undefined;
    return [
      {
        phase: "Grant · Pre-flight",
        tone: h.before.pass < h.before.total ? "fail" : "done",
        value: `${h.before.pass}/${h.before.total}`,
        unit: `on v${h.before.version}`,
        caption: `Before ${h.tool} has run`,
      },
      t
        ? {
            phase: "Recall · Transfer",
            tone: "done",
            value: String(t.cases.length),
            unit: t.cases.length === 1 ? "case carried" : "cases carried",
            caption: `From incident #${t.incident}${top !== undefined ? ` · top match ${top.toFixed(2)}` : ""}`,
          }
        : { phase: "Recall · Transfer", tone: "done", value: "0", unit: "carried", caption: "Nothing similar on record" },
      evalTile,
      promoteTile,
    ];
  }

  const check = run?.check;
  const runTile: Tile = check
    ? {
        phase: "Run · Check",
        tone: check.ok ? "win" : "fail",
        value: String(check.effects),
        unit: check.effects === 1 ? check.noun : `${check.noun}s`,
        caption: check.violations?.length
          ? cap(check.violations[0]) + "."
          : `Expected ${check.expected}. ${check.report.agrees ? "The report agrees." : `The agent said ${check.report.status}.`}`,
      }
    : { phase: "Run · Check", tone: "wait", value: "—", unit: "no run", caption: "" };

  if (mode === "learn" && h.kind === "incident") {
    const hits = memory.kind === "recall" ? memory.hits.length : 0;
    return [
      runTile,
      {
        phase: "Incident · Recall",
        tone: "done",
        value: `#${h.incident.n}`,
        unit: "incident",
        caption: `${plural(h.incident.newCases.length, "new case")} · ${hits} similar recalled`,
      },
      evalTile,
      promoteTile,
    ];
  }

  // clean
  // A failed check is always stored as an incident; only a timeout followed by a duplicate is learned from.
  const incidentTile: Tile = check && !check.ok
    ? { phase: "Incident · Recall", tone: "fail", value: "1", unit: "incident stored", caption: "Not the retry fault, so nothing to learn" }
    : { phase: "Incident · Recall", tone: "wait", value: "—", unit: "no incident", caption: "The check passed; nothing to learn" };
  return [
    runTile,
    incidentTile,
    { phase: "Propose · Eval", tone: "wait", value: "—", unit: "no change", caption: "Nothing proposed" },
    heldTile,
  ];
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
