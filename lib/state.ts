// The contract between the page and the engine: what GET /api/state returns.
// First draft written by Opus from the page's needs; Codex owns this file from here.
// Change it freely — the page and fixtures/state/*.json follow.
//
// The page calls, and nothing else:
//   GET  /api/state                          → ConsoleState (polled every 500 ms)
//   POST /api/beat   { beat: BeatId, fault? } → runs a beat; `fault` is the picker's value and
//                                               applies to that run only
//   POST /api/reset                          → wipes and reseeds, like `npm run reset`

export type Mode = "live" | "replay";
export type BeatId = "order-1" | "order-2" | "grant-issue_refund" | "refund-1" | "order-n";
export type FaultPick = "after_commit" | "before_commit" | "after_commit_lookup_down" | "none";
export type Fault = "timeout_after_commit" | "timeout_before_commit" | "lookup_error";
export type Outcome = "pass" | "fail" | "uncertain";
export type Section = "rules" | "guardrails" | "context" | "tools";

export interface ConsoleState {
  mode: Mode;
  store: { name: string; agent: string };
  policy: PolicyView;
  reload: { at: string; via: "change stream" | "polling" } | null;
  beats: { id: Exclude<BeatId, "order-n">; label: string; status: "done" | "next" | "todo" | "running" }[];
  running: BeatId | null;
  run: RunView | null;
  harness: HarnessView;
  memory: MemoryView;
  versions: VersionView[];
}

// The active policy — the header pill, which opens its case grid.
export interface PolicyView {
  version: number;
  hash: string;
  pass: number;
  total: number;
  evalRunId: string | null; // the run that earned it; null for the baseline
  cases: PolicyCaseView[]; // that run's cases, in suite order
}

export interface PolicyCaseView {
  id: string;
  outcome: Outcome;
  origin: "seed" | "incident" | "transfer";
  about: string; // what the case sets up: "times out before saving"
  result: string; // what the evaluator saw: "1 order · done"
}

// ── 01 · Run ────────────────────────────────────────────────────────────────

export interface RunView {
  title: string; // "Order #1", "Refund #1"
  policy: { version: number; hash: string };
  startedAt: string; // "14:01:52"
  task: {
    kind: "place_order" | "refund";
    customer: { id: string; name: string };
    detail: string; // "2 × Oat Milk 1L (OAT-1L) at $4.49."
  };
  picked: FaultPick | null; // set when the run used a fault-picker pick
  steps: StepView[];
  check: CheckView | null; // null while the run is in progress
}

export interface StepView {
  actor: "llm" | "harness";
  tool: string;
  args: (string | number)[];
  note?: string; // "not retried", "done"
  result?: {
    kind: "ok" | "timeout" | "lookup_error" | "found" | "adopted" | "halted";
    ref?: string; // "o_7Q2L"
    text?: string; // "1 order"
  };
  clause?: string; // "rules[0]"
  action?: "retry" | "verify" | "adopt" | "recheck";
  recheck?: { n: number; of: number };
  ms?: number;
  fault?: Fault; // UI only — never reaches the proposer
  quote?: string; // the report's summary
}

export interface CheckView {
  noun: "order" | "refund";
  effects: number;
  expected: number;
  scope: string; // "live"
  report: { status: "done" | "failed" | "escalated"; agrees: boolean };
  ok: boolean;
}

// ── 02 · Harness ────────────────────────────────────────────────────────────

export type HarnessView =
  | { kind: "idle" }
  | {
      kind: "incident";
      incident: { n: number; summary: string; newCases: string[] };
      before: { version: number; pass: number; total: number };
      candidates: CandidateView[];
    }
  | {
      kind: "clean";
      compare?: { before: RunSummary; after: RunSummary }; // same fault, two policies
      pick?: { pick: FaultPick; caseId: string; note: string }; // the pick, as a test
      active: ActiveView;
    }
  | {
      kind: "grant";
      tool: string;
      toVersion: number;
      before: { version: number; pass: number; total: number };
      candidates: CandidateView[];
    };

export interface RunSummary {
  label: string; // "order #1"
  version: number;
  hash: string;
  effects: number;
  noun: "order" | "refund";
  ok: boolean;
  note: string; // "Retried without checking."
}

export interface CaseView {
  id: string;
  outcome: Outcome;
  lit?: boolean; // outlined: the case this moment is about
}

export interface CandidateView {
  letter: string;
  name: string;
  section: Section;
  status: "promoted" | "rejected" | "screened";
  promotedTo?: number;
  diff: string[]; // one line each, already prefixed "+ "
  highlights?: string[]; // substrings of diff to underline
  cases: CaseView[]; // empty when screened
  failed?: { caseId: string; detail: string };
  screened?: string[]; // the literals it named
}

export interface ActiveView {
  version: number;
  section: Section;
  evalRunId: string;
  diff: string[];
  highlights?: string[];
  cases: CaseView[];
  note: string; // "Fired once, on order #2: …"
}

// ── 03 · Memory ─────────────────────────────────────────────────────────────

export type MemoryView =
  | {
      kind: "recall";
      title: string; // "Recall", "Recall for issue_refund"
      index: string; // "incidents_vec"
      of: number;
      query: { label: string; text: string };
      hits: HitView[];
      transferred?: { incident: number; tool: string; cases: string[]; note: string };
    }
  | {
      kind: "stored";
      counts: { live: number; seed: number };
      note: string | null;
      live: IncidentView[];
      seed: { tool: string; summary: string }[];
    };

export interface HitView extends IncidentView {
  score?: number; // only with vector search
}

export interface IncidentView {
  origin: "live" | "seed";
  tool: string;
  incident?: number;
  summary: string;
  attempts: AttemptView[];
  carried?: { tool: string; caseId: string; version: number };
}

export interface AttemptView {
  name: string;
  version?: number;
  status: "promoted" | "rejected" | "screened";
  detail: string; // "4/4", "failed order.transient", "named the incident"
}

// ── Version history ─────────────────────────────────────────────────────────

export interface VersionView {
  version: number;
  hash: string;
  origin: "baseline" | "learned" | "granted" | "transfer";
  incident?: number;
  evalRunId?: string;
}
