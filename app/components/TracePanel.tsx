"use client";

import { useState } from "react";
import type { Fault, HitView, MemoryView, RunView, StepView } from "@/lib/state";
import { PICK_LABEL, type Story } from "./story";
import { Icon, Panel, PanelHead } from "./ui";

const FAULT_LABEL: Record<Fault, string> = {
  timeout_after_commit: "after commit",
  timeout_before_commit: "before commit",
  lookup_error: "lookup down",
};

// Left panel: what the agent did. A beat that made no run shows what the harness remembered.
export default function TracePanel({ story, memory }: { story: Story; memory: MemoryView }) {
  if (story.mode === "grant") return <Remembered memory={memory} lastRun={story.lastRun} />;
  const run = story.run;
  return (
    <Panel className="gap-4">
      <PanelHead title="What the agent did" aside={run && `v${run.policy.version} · ${run.startedAt}`} />
      {run ? (
        <>
          <Task run={run} />
          <Steps steps={run.steps} />
        </>
      ) : (
        <p className="text-[13.5px] text-muted">No runs yet. Each run is checked; a failed check becomes an incident.</p>
      )}
      <Footer story={story} memory={memory} />
    </Panel>
  );
}

function Task({ run }: { run: RunView }) {
  const { task } = run;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[14.5px]">
        {task.kind === "refund" ? "Refund" : "Place an order for"} <strong className="font-semibold">{task.customer.name}</strong>{" "}
        <span className="font-mono text-xs text-muted">{task.customer.id}</span>: {task.detail}
      </p>
      {run.picked && (
        <span className="flex items-center gap-2 text-[12.5px] text-muted">
          Picked live
          <span className="rounded-[5px] border border-dashed border-faint px-1.5 font-mono text-[11px] text-ink">{PICK_LABEL[run.picked]}</span>
        </span>
      )}
    </div>
  );
}

function Steps({ steps }: { steps: StepView[] }) {
  return (
    <ol className="flex min-h-0 flex-col">
      {steps.map((s, i) => {
        const bad = s.result?.kind === "timeout" || s.result?.kind === "lookup_error" || s.result?.kind === "halted";
        const last = i === steps.length - 1;
        return (
          <li key={i} className="grid grid-cols-[20px_1fr] gap-3">
            <div className="flex flex-col items-center">
              <span className={`mt-[5px] size-[9px] rounded-full ${bad ? "bg-fail" : s.actor === "harness" ? "bg-ink" : "bg-muted"}`} />
              {!last && <span className="w-px grow bg-line" />}
            </div>
            <div className={`flex min-w-0 flex-col gap-0.5 ${last ? "" : "pb-3.5"}`}>
              <span className="truncate font-mono text-[13.5px]">
                {s.tool}
                {s.args.length > 0 && <span className="text-xs text-muted"> {s.args.join(" · ")}</span>}
                <span className="text-[10.5px] tracking-[0.08em] text-muted">
                  {" · "}
                  {s.actor.toUpperCase()}
                  {s.action && ` ${s.action.toUpperCase()}`}
                </span>
              </span>
              <Outcome s={s} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Outcome({ s }: { s: StepView }) {
  const r = s.result;
  if (s.quote) return <span className="text-[13px] text-soft">“{s.quote}”</span>;
  if (!r && !s.note && !s.fault) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      {r?.kind === "timeout" && <span className="font-mono font-semibold text-fail">TIMEOUT</span>}
      {r?.kind === "lookup_error" && <span className="font-mono font-semibold text-fail">LOOKUP_UNAVAILABLE</span>}
      {r?.kind === "halted" && <span className="font-mono font-semibold text-fail">HALTED</span>}
      {r?.kind === "ok" && <span className="text-soft">ok{r.ref && <span className="font-mono"> → {r.ref}</span>}{r.text && ` · ${r.text}`}</span>}
      {r?.kind === "found" && <span className="text-soft">found <span className="font-mono">{r.ref}</span></span>}
      {r?.kind === "adopted" && <span className="text-accent">adopted <span className="font-mono">{r.ref}</span> instead</span>}
      {s.recheck && <span className="font-mono text-xs text-muted">recheck {s.recheck.n} of {s.recheck.of}</span>}
      {s.clause && <span className="font-mono text-xs text-muted">{s.clause}</span>}
      {s.fault && (
        <span className="rounded-[5px] border border-dashed border-faint px-1.5 font-mono text-[11px] text-muted">injected · {FAULT_LABEL[s.fault]}</span>
      )}
    </span>
  );
}

// Under the trace: the incident's new cases and what recall found, or what memory holds.
function Footer({ story, memory }: { story: Story; memory: MemoryView }) {
  if (memory.kind === "recall" && story.mode === "learn") {
    return (
      <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Similar incidents</span>
          <span className="font-mono text-[11.5px] text-muted">
            {memory.hits.length} of {memory.of}
            {memory.hits.every((h) => h.origin === "seed") && " · seed only"}
          </span>
        </div>
        <ul className="flex flex-col gap-1">
          {memory.hits.slice(0, 3).map((h, i) => (
            <li key={i} className="grid grid-cols-[40px_1fr] gap-2.5 text-[13px]">
              <span className="font-mono font-semibold">{h.score?.toFixed(2) ?? "—"}</span>
              <span className="truncate text-soft" title={h.summary}>
                {h.summary} <span className="font-mono text-[11px] text-muted">· {h.tool}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (story.mode === "idle" && memory.kind === "stored") {
    return (
      <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">On record · {memory.counts.seed} seed incidents</span>
        <ul className="flex flex-col gap-1 text-[13px] text-soft">
          {memory.seed.slice(0, 4).map((s) => (
            <li key={s.tool} className="truncate">
              {s.summary} <span className="font-mono text-[11px] text-muted">· {s.tool}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (memory.kind !== "stored" || !memory.note) return null;
  return (
    <p className="mt-auto border-t border-line pt-4 text-[13px] text-muted">
      {memory.note} {memory.counts.live > 0 && `${memory.counts.live} live · ${memory.counts.seed} seed incidents on record.`}
    </p>
  );
}

function Remembered({ memory, lastRun }: { memory: MemoryView; lastRun: RunView | null }) {
  const [open, setOpen] = useState(false);
  if (open && lastRun) {
    return (
      <Panel className="gap-4">
        <PanelHead title={`Last run · ${lastRun.title}`} aside={`v${lastRun.policy.version} · ${lastRun.startedAt}`} />
        <Task run={lastRun} />
        <Steps steps={lastRun.steps} />
        <button type="button" onClick={() => setOpen(false)}
          className="mt-auto h-[30px] self-start rounded-lg border border-line px-2.5 text-[12.5px] text-muted hover:text-ink">
          Back to memory
        </button>
      </Panel>
    );
  }
  const hits = memory.kind === "recall" ? memory.hits : [];
  const [first, ...rest] = hits;
  return (
    <Panel className="gap-3.5">
      <PanelHead title="What it remembered" aside={memory.kind === "recall" && `${memory.index} · ${Math.min(hits.length, 2)} of ${memory.of}`} />
      {memory.kind === "recall" && (
        <>
          <p className="font-mono text-[12px] leading-[1.55] text-code-ink">{memory.query.text}</p>
          {first && <Hit h={first} />}
          {rest.slice(0, 1).map((h, i) => (
            <div key={i} className="grid grid-cols-[40px_1fr] gap-2.5 px-4 text-[13px]">
              <span className="font-mono font-semibold">{h.score?.toFixed(2)}</span>
              <span className="truncate text-soft">
                {h.summary} <span className="font-mono text-[11px] text-muted">· {h.origin.toUpperCase()}</span>
              </span>
            </div>
          ))}
          {memory.transferred && (
            <div className="flex flex-col gap-2 rounded-xl border border-line-strong px-4 py-3.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Carried over as tests</span>
              <div className="flex flex-wrap gap-1.5">
                {memory.transferred.cases.map((id) => (
                  <span key={id} className="rounded-[5px] border border-line-strong px-[7px] py-px font-mono text-[11.5px]">
                    {id}
                  </span>
                ))}
              </div>
              <span className="text-[12.5px] text-muted">{memory.transferred.note}</span>
            </div>
          )}
        </>
      )}
      {lastRun && (
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3.5">
          <span className="truncate text-[13px] text-muted">
            Last run: {lastRun.title}
            {lastRun.check && (
              <>
                {" · "}
                <span className={lastRun.check.ok ? "text-accent" : "text-fail"}>
                  {lastRun.check.effects} {lastRun.check.noun}
                  {lastRun.check.effects === 1 ? "" : "s"}
                </span>
              </>
            )}{" "}
            on v{lastRun.policy.version}
          </span>
          <button type="button" onClick={() => setOpen(true)}
            className="h-[30px] shrink-0 rounded-lg border border-line px-2.5 text-[12.5px] text-muted hover:text-ink">
            Show trace
          </button>
        </div>
      )}
    </Panel>
  );
}

function Hit({ h }: { h: HitView }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-card px-4 py-3.5">
      <div className="flex items-center gap-2.5 font-mono text-[11.5px] text-muted">
        <span className="text-[15px] font-semibold text-ink">{h.score?.toFixed(2)}</span>
        <span className={`rounded-[5px] border px-1.5 text-[10.5px] tracking-[0.08em] ${h.origin === "live" ? "border-line-strong text-ink" : "border-line"}`}>
          {h.origin.toUpperCase()}
        </span>
        <span>
          {h.incident ? `incident #${h.incident} · ` : ""}
          {h.tool}
        </span>
      </div>
      <div className="text-[13.5px]">{h.summary}</div>
      {h.attempts.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line pt-2 text-[12.5px]">
          {h.attempts.map((a) => {
            const ok = a.status === "promoted";
            return (
              <span key={a.name} className={`flex items-center gap-2 ${ok ? "text-accent" : "text-fail"}`}>
                <Icon kind={ok ? "check" : "cross"} />
                <span>
                  {a.version ? `v${a.version} ` : ""}
                  {a.name}
                </span>
                <span className="text-muted">
                  {a.status} · {a.detail}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
