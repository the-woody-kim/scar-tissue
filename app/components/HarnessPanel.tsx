import type { ActiveView, CandidateView, CheckView, HarnessView, RunSummary, VersionView } from "@/lib/state";
import { PICK_LABEL } from "./RunPanel";
import { Card, CaseChip, CaseGrid, Diff, Eyebrow, Icon, Panel, SectionChip, Stamp, passCount } from "./ui";

const LEARN = ["Run", "Check", "Incident", "Recall", "Propose", "Eval", "Promote", "Reload"];
const GRANT = ["Grant", "Recall", "Transfer", "Propose", "Eval", "Promote", "Reload"];

export default function HarnessPanel({ harness, versions, check }: { harness: HarnessView; versions: VersionView[]; check: CheckView | null }) {
  const phases = harness.kind === "grant" ? GRANT : LEARN;
  const done = harness.kind === "idle" ? 0 : harness.kind === "clean" ? 2 : phases.length;
  return (
    <Panel className="w-[580px] shrink-0 gap-3">
      <div className="flex flex-col gap-1.5">
        <Eyebrow>02 · Harness</Eyebrow>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.08em]">
          {phases.map((p, i) => (
            <span key={p} className="flex items-center gap-2">
              <span className={`flex items-center gap-[5px] ${i < done ? "text-accent" : "text-muted"}`}>
                <span className={`size-1.5 rounded-full ${i < done ? "bg-accent" : "border border-muted"}`} />
                {p}
              </span>
              {i < phases.length - 1 && <span className="text-faint">›</span>}
            </span>
          ))}
        </div>
        <Title harness={harness} check={check} />
      </div>
      {harness.kind === "incident" && (
        <>
          <Card className="gap-2.5 px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-px shrink-0 rounded-[5px] bg-fail/12 px-[7px] py-px font-mono text-[11px] tracking-[0.06em] text-fail">
                INCIDENT #{harness.incident.n}
              </span>
              <span>{harness.incident.summary}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <span>New cases from the trace</span>
              {harness.incident.newCases.map((id) => (
                <span key={id} className="rounded-[5px] border border-line px-[7px] py-px font-mono text-[11.5px] text-ink">
                  {id}
                </span>
              ))}
            </div>
          </Card>
          {harness.candidates.map((c) => (
            <Candidate key={c.letter} c={c} />
          ))}
        </>
      )}
      {harness.kind === "grant" && (
        <>
          <Card className="gap-1.5 px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="rounded-[5px] border border-line px-[7px] py-px font-mono text-[11px] tracking-[0.06em]">TOOL GRANT</span>
              <span className="text-[15px]">
                The operator granted {harness.tool} → v{harness.toVersion}.
              </span>
            </div>
            <span className="text-[13px] text-muted">
              Pre-flight on v{harness.before.version}: {harness.before.pass}/{harness.before.total} — before {harness.tool} has run.
            </span>
          </Card>
          {harness.candidates.map((c) => (
            <Candidate key={c.letter} c={c} />
          ))}
        </>
      )}
      {harness.kind === "clean" && (
        <>
          {harness.compare && <Compare before={harness.compare.before} after={harness.compare.after} />}
          {harness.pick && (
            <Card className="gap-2.5 px-[18px] py-3.5">
              <Eyebrow>The pick, as a test</Eyebrow>
              <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
                <span className="rounded-md border border-dashed border-faint px-2.5 py-1 font-mono text-xs text-ink">
                  {PICK_LABEL[harness.pick.pick]}
                </span>
                <span>is the case</span>
                <CaseChip c={{ id: harness.pick.caseId, outcome: "pass", lit: true }} />
              </div>
              <p className="text-[13px] text-muted">{harness.pick.note}</p>
            </Card>
          )}
          <Active a={harness.active} />
        </>
      )}
      {harness.kind === "idle" && (
        <p className="text-[13px] text-muted">Nothing to learn yet. Each run is checked; a failed check becomes an incident here.</p>
      )}
      <Versions versions={versions} />
    </Panel>
  );
}

// "clean" must never sit over a failed check: the run panel's verdict wins.
function Title({ harness, check }: { harness: HarnessView; check: CheckView | null }) {
  const [title, right] =
    harness.kind === "incident"
      ? [`Incident #${harness.incident.n}`, `${harness.before.version === 1 ? "baseline v1" : `v${harness.before.version} before`} · ${harness.before.pass}/${harness.before.total}`]
      : harness.kind === "grant"
        ? [`Tool grant · ${harness.tool}`, `v${harness.before.version} before · ${harness.before.pass}/${harness.before.total}`]
        : harness.kind === "clean"
          ? check && !check.ok
            ? ["Still failing", `the check failed · ${check.effects} ${check.noun}s, expected ${check.expected}`]
            : ["No incident", "the check passed · nothing to learn"]
          : ["Waiting", ""];
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <span className="font-mono text-xs text-muted">{right}</span>
    </div>
  );
}

function Candidate({ c }: { c: CandidateView }) {
  if (c.status === "screened") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong bg-card px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="font-mono text-xs text-muted">{c.letter}</span>
          <span className="truncate text-[15px] font-semibold">{c.name}</span>
          <SectionChip section={c.section} />
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="text-[12.5px] text-muted">
            names <span className="font-mono text-fail">{(c.screened ?? []).join(" · ")}</span>
          </span>
          <Stamp tone="fail">SCREENED</Stamp>
        </div>
      </div>
    );
  }
  const pass = passCount(c.cases);
  const promoted = c.status === "promoted";
  return (
    <Card className="gap-2 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="font-mono text-xs text-muted">{c.letter}</span>
          <span className="truncate text-[15px] font-semibold">{c.name}</span>
          <SectionChip section={c.section} />
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className={`font-mono text-[13px] ${promoted ? "text-accent" : "text-fail"}`}>
            {pass}/{c.cases.length}
          </span>
          <Stamp tone={promoted ? "accent" : "fail"}>{promoted ? `PROMOTED → v${c.promotedTo}` : "REJECTED"}</Stamp>
        </div>
      </div>
      {promoted ? (
        <>
          <Diff lines={c.diff} highlights={c.highlights} />
          {c.cases.length > 4 ? (
            // A long suite would push the version history off a 1080p screen; the pill opens the grid.
            <div className="flex items-center gap-2 text-[13px] text-accent">
              <Icon kind="check" />
              <span>All {c.cases.length} cases pass. The pill opens the grid.</span>
            </div>
          ) : (
            <CaseGrid cases={c.cases} />
          )}
        </>
      ) : (
        // Rejected: the change's first line and only the cases it failed, so the winner stays on screen.
        <>
          <Diff lines={c.diff.slice(0, 1).map((l) => (l.length > 140 ? `${l.slice(0, 139)}…` : l))} highlights={c.highlights} />
          <Misses c={c} />
        </>
      )}
      {c.failed && (
        <div className="text-[13px] text-muted">
          <span className="text-fail">Failed {c.failed.caseId}</span> — {c.failed.detail}
        </div>
      )}
    </Card>
  );
}

// A rejected candidate's misses: the named failure first, capped at one row so a long suite
// cannot push the next candidate off a 1080p screen.
function Misses({ c }: { c: CandidateView }) {
  const misses = c.cases.filter((x) => x.outcome !== "pass");
  if (!misses.length) return null;
  const named = c.failed?.caseId;
  const ordered = [...misses.filter((x) => x.id === named), ...misses.filter((x) => x.id !== named)];
  const shown = ordered.slice(0, 3).map((x) => (x.id === named ? { ...x, lit: true } : x));
  return (
    <div className="flex flex-col gap-1">
      <CaseGrid cases={shown} row />
      {misses.length > shown.length && (
        <span className="font-mono text-[11.5px] text-muted">+{misses.length - shown.length} more not passed</span>
      )}
    </div>
  );
}

function Compare({ before, after }: { before: RunSummary; after: RunSummary }) {
  return (
    <Card className="gap-3 px-[18px] py-3.5">
      <Eyebrow>Same fault · two policies</Eyebrow>
      <div className="grid grid-cols-2 gap-3">
        {[before, after].map((r, i) => (
          <div key={i}className={`flex flex-col gap-1 rounded-[10px] border px-4 py-3 ${r.ok ? "border-accent/40 bg-accent/[0.06]" : "border-fail/40 bg-fail/[0.07]"}`}>
            <span className="font-mono text-xs text-muted">
              {r.label} · v{r.version} · {r.hash}
            </span>
            <div className="flex items-baseline gap-2">
              <span className={`text-[40px] font-semibold leading-none ${r.ok ? "text-accent" : "text-fail"}`}>{r.effects}</span>
              <span className="text-[15px] font-semibold">
                {r.noun}
                {r.effects === 1 ? "" : "s"}
              </span>
            </div>
            <span className="text-[13px] text-muted">{r.note}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Active({ a }: { a: ActiveView }) {
  const pass = passCount(a.cases);
  return (
    <Card className="gap-2.5 px-[18px] py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[16px] font-semibold">Active · v{a.version}</span>
          <SectionChip section={a.section} />
        </div>
        <span className="font-mono text-xs text-muted">
          <span className="text-[13px] text-accent">
            {pass}/{a.cases.length}
          </span>{" "}
          eval {a.evalRunId}
        </span>
      </div>
      <Diff lines={a.diff} highlights={a.highlights} />
      <CaseGrid cases={a.cases} />
      <p className="text-[13px] text-muted">{a.note}</p>
    </Card>
  );
}

const ORIGIN: Record<VersionView["origin"], string> = {
  baseline: "baseline",
  learned: "learned",
  granted: "granted",
  transfer: "transfer",
};

function Versions({ versions }: { versions: VersionView[] }) {
  const long = versions.length <= 2;
  return (
    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3 font-mono text-xs text-muted">
      {versions.map((v, i) => {
        const last = i === versions.length - 1;
        const from = v.incident ? (long ? ` from incident #${v.incident}` : ` · #${v.incident}`) : "";
        const detail = long || last ? ` · ${v.hash}${long && v.evalRunId ? ` · eval ${v.evalRunId}` : ""}` : "";
        return (
          <span key={v.version} className="flex items-center gap-2">
            {i > 0 && <span className="text-faint">›</span>}
            <span className={last && versions.length > 1 ? "text-accent" : ""}>
              v{v.version} {ORIGIN[v.origin]}
              {from}
              {detail}
            </span>
          </span>
        );
      })}
    </div>
  );
}
