import type { CheckView, Fault, FaultPick, RunView, StepView } from "@/lib/state";
import { Eyebrow, Icon, Panel, plural } from "./ui";

export const PICK_LABEL: Record<FaultPick, string> = {
  after_commit: "timeout after saving",
  before_commit: "timeout before saving",
  after_commit_lookup_down: "after saving + lookup down",
  none: "none",
};

const FAULT_LABEL: Record<Fault, string> = {
  timeout_after_commit: "timeout after commit",
  timeout_before_commit: "timeout before commit",
  lookup_error: "lookup error",
};

export default function RunPanel({ run }: { run: RunView | null }) {
  return (
    <Panel className="w-[440px] shrink-0 gap-3.5">
      <div className="flex flex-col gap-1.5">
        <Eyebrow>01 · Run</Eyebrow>
        {run && (
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-semibold">{run.title}</h2>
            <span className="font-mono text-xs text-muted">
              policy v{run.policy.version} · {run.policy.hash} · {run.startedAt}
            </span>
          </div>
        )}
      </div>
      {run ? <RunBody run={run} /> : <p className="text-[13px] text-muted">No runs yet. Start with Run order #1.</p>}
    </Panel>
  );
}

function RunBody({ run }: { run: RunView }) {
  const { task } = run;
  const verb = task.kind === "refund" ? "Refund" : "Place an order for";
  return (
    <>
      <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-card px-[18px] py-3">
        <div className="text-[15px] leading-[1.45]">
          {verb} <strong className="font-semibold">{task.customer.name}</strong> ({task.customer.id}): {task.detail}
        </div>
        {run.picked && (
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <span>Picked by a judge</span>
            <span className="rounded-[5px] border border-dashed border-faint px-1.5 font-mono text-[11.5px] text-ink">
              {PICK_LABEL[run.picked]}
            </span>
          </div>
        )}
      </div>
      <ol className="flex flex-col gap-2.5">
        {run.steps.map((s, i) => (
          <Step key={i} n={i + 1} s={s} />
        ))}
      </ol>
      {run.steps.some((s) => s.fault) && (
        <p className="text-[12.5px] text-muted">Dashed tags are the injector&apos;s labels. They never reach the proposer.</p>
      )}
      {run.check && <Check check={run.check} />}
    </>
  );
}

function Step({ n, s }: { n: number; s: StepView }) {
  return (
    <li className="grid grid-cols-[22px_1fr] gap-x-2">
      <span className="pt-0.5 font-mono text-xs text-muted">{n}</span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 font-mono">
          <span className={`rounded-[5px] border px-1.5 text-[11px] ${s.actor === "llm" ? "border-line text-muted" : "border-line-strong text-ink"}`}>
            {s.actor}
          </span>
          <span className="text-[13.5px]">{s.tool}</span>
          {s.args.length > 0 && <span className="text-xs text-muted">{s.args.join(" · ")}</span>}
          {s.note && <span className="text-xs text-muted">{s.note}</span>}
        </div>
        <Outcome s={s} />
        {s.quote && <div className="text-[13px] text-code-ink">“{s.quote}”</div>}
      </div>
    </li>
  );
}

function Outcome({ s }: { s: StepView }) {
  const r = s.result;
  if (!r && !s.clause && !s.fault) return null;
  const via = [s.clause, s.recheck ? undefined : s.action].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
      {r?.kind === "timeout" && <span className="font-semibold text-fail">TIMEOUT</span>}
      {r?.kind === "lookup_error" && <span className="font-semibold text-fail">LOOKUP_UNAVAILABLE</span>}
      {r?.kind === "halted" && <span className="font-semibold text-fail">halted</span>}
      {r?.kind === "ok" && (
        <span className="text-ink">
          ok{r.ref && ` → ${r.ref}`}
          {r.text && ` · ${r.text}`}
        </span>
      )}
      {r?.kind === "found" && <span className="text-ink">found {r.ref}</span>}
      {r?.kind === "adopted" && <span className="text-accent">adopted {r.ref}</span>}
      {via && <span className="text-muted">{via}</span>}
      {s.recheck && (
        <span className="text-muted">
          recheck {s.recheck.n} of {s.recheck.of}
        </span>
      )}
      {s.ms !== undefined && <span className="text-muted">{s.ms.toLocaleString("en-US")} ms</span>}
      {s.fault && (
        <span className="rounded-[5px] border border-dashed border-faint px-1.5 text-[11.5px] text-muted">
          injected · {FAULT_LABEL[s.fault]}
        </span>
      )}
    </div>
  );
}

function Check({ check }: { check: CheckView }) {
  const tone = check.ok ? "border-accent/40 bg-accent/[0.06]" : "border-fail/40 bg-fail/[0.07]";
  const fg = check.ok ? "text-accent" : "text-fail";
  const { report } = check;
  const lines = [
    { ok: check.effects === check.expected, text: `effects — ${plural(check.effects, check.noun)} for 1 request` },
    {
      ok: report.agrees,
      text: report.agrees
        ? `report — said ${report.status}; the database agrees`
        : `report — said ${report.status}; the database has ${check.effects}`,
    },
  ];
  return (
    <div className={`mt-auto flex flex-col gap-2.5 rounded-xl border px-[18px] py-4 ${tone}`}>
      <Eyebrow tone={check.ok ? "accent" : "fail"}>Check · after the run</Eyebrow>
      <div className="flex items-center gap-3">
        <span className={`text-[46px] font-semibold leading-none ${fg}`}>{check.effects}</span>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold">
            {check.noun}
            {check.effects === 1 ? "" : "s"} for this request
          </span>
          <span className="font-mono text-xs text-muted">
            expected {check.expected} · scope {check.scope}
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-1 text-[13px]">
        {lines.map((l) => (
          <li key={l.text} className="flex items-center gap-2">
            <Icon kind={l.ok ? "check" : "cross"} className={l.ok ? "text-accent" : "text-fail"} />
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
