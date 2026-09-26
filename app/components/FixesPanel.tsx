import type { CandidateView, CaseView, HarnessView, RunSummary, Section, VersionView } from "@/lib/state";
import { PICK_LABEL, type Story } from "./story";
import { CaseChip, CaseGrid, Diff, Panel, PanelHead, SectionChip, Stamp, passCount } from "./ui";

// Right panel: what the harness changed — the winner first, the fixes that didn't make it under it.
// A run with nothing to learn shows the policy that handled it instead.
export default function FixesPanel({ story, harness, versions }: { story: Story; harness: HarnessView; versions: VersionView[] }) {
  const { winner, losers } = story;
  const learning = story.mode === "learn" || story.mode === "grant";
  const before = harness.kind === "incident" || harness.kind === "grant" ? harness.before : null;

  if (story.mode === "clean") {
    const active = harness.kind === "clean" ? harness.active : null;
    return (
      <Panel className="gap-4">
        <PanelHead title="Policy in force" aside={active ? `eval ${active.evalRunId}` : undefined} />
        {harness.kind === "clean" && harness.compare && <Compare before={harness.compare.before} after={harness.compare.after} />}
        {active ? (
          <Active version={active.version} section={active.section} diff={active.diff} highlights={active.highlights} cases={active.cases} note={active.note} />
        ) : (
          winner && (
            <Active version={winner.promotedTo ?? 0} section={winner.section} diff={winner.diff} highlights={winner.highlights}
              cases={winner.cases} note="Promoted before this tool's first call." />
          )
        )}
        {harness.kind === "clean" && harness.pick && (
          <div className="flex flex-col gap-2 rounded-xl border border-line px-4 py-3">
            <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
              The pick
              <span className="rounded-md border border-dashed border-faint px-2 py-0.5 font-mono text-xs text-ink">{PICK_LABEL[harness.pick.pick]}</span>
              is the case
              <CaseChip c={{ id: harness.pick.caseId, outcome: "pass", lit: true }} />
            </div>
            <p className="text-[13px] text-muted">{harness.pick.note}</p>
          </div>
        )}
        <Versions versions={versions} />
      </Panel>
    );
  }

  return (
    <Panel className="gap-4">
      <PanelHead
        title="What the harness changed"
        aside={
          learning && before ? (
            <>
              v{before.version} {before.pass}/{before.total}
              {winner && (
                <span className="text-accent">
                  {" "}→ v{winner.promotedTo} {passCount(winner.cases)}/{winner.cases.length}
                </span>
              )}
            </>
          ) : undefined
        }
      />
      {learning ? (
        <>
          {winner && <Winner c={winner} />}
          {losers.length > 0 && (
            <div className="flex flex-col">
              <div className="pb-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{winner ? "Didn’t make it" : "No fix passed"}</div>
              {losers.map((c) => (
                <Loser key={c.letter} c={c} />
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-[13.5px] text-muted">
          {story.mode === "running" ? "Waiting for the check. Fixes are proposed only when it fails." : "Nothing to fix yet."}
        </p>
      )}
      <Versions versions={versions} />
    </Panel>
  );
}

function Winner({ c }: { c: CandidateView }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent/45 bg-card px-[18px] py-4">
      <div className="flex items-center gap-2.5">
        <span className="truncate text-[17px] font-semibold">{c.name}</span>
        <SectionChip section={c.section} />
        <span className="grow" />
        <Stamp tone="accent">PROMOTED → v{c.promotedTo}</Stamp>
      </div>
      <Diff lines={c.diff} highlights={c.highlights} />
      <CaseGrid cases={c.cases} />
    </div>
  );
}

function Loser({ c }: { c: CandidateView }) {
  const screened = c.status === "screened";
  return (
    <div className="flex items-center gap-3 border-t border-line py-3">
      <span className="flex min-w-0 grow flex-col">
        <span className="truncate text-sm font-semibold">
          {c.name} <span className="font-mono text-[10.5px] font-normal uppercase tracking-[0.08em] text-muted">· {c.section}</span>
        </span>
        <span className="truncate text-[13px] text-muted">
          {screened ? (
            <>
              Named <span className="font-mono text-fail">{(c.screened ?? []).join(" · ")}</span> from the incident, so it never ran
            </>
          ) : (
            <>
              {passCount(c.cases)}/{c.cases.length}
              {c.failed && (
                <>
                  {" · failed "}
                  <span className="font-mono text-fail">{c.failed.caseId}</span>: {c.failed.detail}
                </>
              )}
            </>
          )}
        </span>
      </span>
      <Stamp tone={screened ? "screened" : "fail"}>{screened ? "SCREENED" : "REJECTED"}</Stamp>
    </div>
  );
}

function Active({ version, section, diff, highlights, cases, note }: {
  version: number;
  section: Section;
  diff: string[];
  highlights?: string[];
  cases: CaseView[];
  note: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-card px-[18px] py-4">
      <div className="flex items-center gap-2.5">
        <span className="text-[17px] font-semibold">Active · v{version}</span>
        <SectionChip section={section} />
        <span className="grow" />
        <span className="font-mono text-[13px] text-accent">
          {passCount(cases)}/{cases.length}
        </span>
      </div>
      <Diff lines={diff} highlights={highlights} />
      <CaseGrid cases={cases} />
      <p className="text-[13px] text-muted">{note}</p>
    </div>
  );
}

function Compare({ before, after }: { before: RunSummary; after: RunSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[before, after].map((r, i) => (
        <div key={i} className={`flex flex-col gap-1 rounded-xl border px-4 py-3 ${r.ok ? "border-accent/40 bg-accent/[0.06]" : "border-fail/40 bg-fail/[0.07]"}`}>
          <span className="font-mono text-xs text-muted">
            {r.label} · v{r.version}
          </span>
          <span className="flex items-baseline gap-2">
            <span className={`text-[30px] font-semibold leading-none ${r.ok ? "text-accent" : "text-fail"}`}>{r.effects}</span>
            <span className="text-sm font-semibold">
              {r.noun}
              {r.effects === 1 ? "" : "s"}
            </span>
          </span>
          <span className="text-[12.5px] text-muted">{r.note}</span>
        </div>
      ))}
    </div>
  );
}

const ORIGIN: Record<VersionView["origin"], string> = {
  baseline: "baseline",
  learned: "learned",
  granted: "granted",
  transfer: "transfer",
};

function Versions({ versions }: { versions: VersionView[] }) {
  return (
    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3.5 font-mono text-xs text-muted">
      {versions.map((v, i) => {
        const last = i === versions.length - 1;
        return (
          <span key={v.version} className="flex items-center gap-2">
            {i > 0 && <span className="text-faint">›</span>}
            <span className={last && versions.length > 1 ? "text-accent" : ""}>
              v{v.version} {ORIGIN[v.origin]}
              {v.incident ? ` #${v.incident}` : ""}
              {last && ` · ${v.hash}`}
            </span>
          </span>
        );
      })}
    </div>
  );
}
