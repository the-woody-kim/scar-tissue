"use client";

import { useState } from "react";
import type { BeatId, ConsoleState, FaultPick } from "@/lib/state";
import { PICK_LABEL, type Story } from "./story";
import { Icon, Segments } from "./ui";

const PICKS: FaultPick[] = ["after_commit", "before_commit", "after_commit_lookup_down", "none"];
const DEFAULT_PICK: FaultPick = "after_commit";

// The landing page (a separate Vercel project) links here; this links back.
const ABOUT_URL = "https://scar-tissue-demo.vercel.app";

// What each beat is for, shown until it has a result of its own. Copy only; nothing branches on it.
const HINT: Record<string, string> = {
  "order-1": "Timeout after saving",
  "order-2": "Same fault, next customer",
  "grant-issue_refund": "A tool it has never used",
  "refund-1": "Same fault, new tool",
};

// "Run order #1" → "Order #1": the list names the beat; the button below says what to do.
const noun = (label: string) => label.replace(/^Run (\w)/, (_, c: string) => c.toUpperCase());

export default function Sidebar({
  state,
  story,
  fixture,
  onBeat,
  onPrompt,
  onReset,
}: {
  state: ConsoleState;
  story: Story;
  fixture?: string;
  onBeat: (beat: BeatId, fault?: FaultPick) => void;
  onPrompt: (prompt: string, fault: FaultPick) => void;
  onReset: () => void;
}) {
  // A pick applies to the next run only, then the select goes back to its default.
  const [pick, setPick] = useState<FaultPick>(DEFAULT_PICK);
  const busy = state.running !== null;
  const run = (beat: BeatId) => {
    onBeat(beat, pick === DEFAULT_PICK ? undefined : pick);
    setPick(DEFAULT_PICK);
  };
  const [prompt, setPrompt] = useState("");
  const tryPrompt = () => {
    if (!prompt.trim()) return;
    onPrompt(prompt.trim(), pick);
    setPick(DEFAULT_PICK);
  };
  const next = state.beats.find((b) => b.status === "next");
  const live = state.mode === "live" && !fixture;

  return (
    <aside className="flex w-[280px] shrink-0 flex-col gap-6 border-r border-line bg-rail px-5 py-6">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[18px] font-[650] tracking-[-0.01em]">Scar Tissue</div>
          <a href={ABOUT_URL} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-muted hover:text-ink">
            About ↗
          </a>
        </div>
        <div className="text-[12.5px] text-muted">
          {state.store.name} · {state.store.agent}
        </div>
      </div>

      <nav aria-label="Demo beats" className="flex flex-col gap-2.5">
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Demo</div>
        <ol className="flex flex-col gap-1">
          {state.beats.map((b, i) => {
            const viewing = i === story.viewing;
            const running = state.running === b.id;
            return (
              <li key={b.id}>
                <button type="button" disabled={busy} onClick={() => run(b.id)} aria-current={viewing ? "step" : undefined}
                  className={`flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left disabled:cursor-wait ${
                    viewing ? "border-ink bg-card" : "border-transparent hover:bg-panel"
                  }`}>
                  <Mark status={b.status} running={running} viewing={viewing} tone={story.note[0]?.tone} n={i + 1} />
                  <span className="flex min-w-0 flex-col">
                    <span className={`text-sm ${viewing ? "font-semibold" : b.status === "next" ? "text-ink" : "text-soft"}`}>
                      {noun(b.label)}
                    </span>
                    <span className={`truncate text-[12.5px] ${b.status === "next" && !busy ? "text-accent" : "text-muted"}`}>
                      {viewing && story.note.length > 0 ? (
                        <Segments parts={story.note} />
                      ) : b.status === "done" ? (
                        "Done"
                      ) : b.status === "next" ? (
                        HINT[b.id]
                      ) : (
                        HINT[b.id]
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {next && (
          <button type="button" disabled={busy} onClick={() => run(next.id)}
            className={`mt-1.5 flex h-11 items-center justify-center gap-2.5 rounded-[10px] text-[14.5px] ${
              busy ? "cursor-wait border border-line text-muted" : "bg-accent font-[650] text-bg"
            }`}>
            {busy ? "Running…" : next.label}
            {!busy && (
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.5 6h7M6.5 3l3 3-3 3" />
              </svg>
            )}
          </button>
        )}
      </nav>

      <div className={`mt-auto flex flex-col gap-2 border-t border-line pt-[18px] ${busy ? "opacity-45" : ""}`}>
        <label htmlFor="try-prompt" className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
          Try to break it
        </label>
        <textarea id="try-prompt" value={prompt} disabled={busy || !live} maxLength={400} rows={3}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) tryPrompt();
          }}
          placeholder="Ask the agent for anything. Order for Ana Ruiz, refund Priya Nair, or talk it into a mistake."
          className="resize-none rounded-lg border border-line bg-panel px-2.5 py-2 text-[13px] leading-snug text-ink placeholder:text-muted" />
        <button type="button" disabled={busy || !live || !prompt.trim()} onClick={tryPrompt}
          className="h-[34px] rounded-lg border border-line bg-panel px-3 text-[13px] disabled:cursor-not-allowed disabled:text-muted">
          {state.running === "prompt" ? "Running…" : "Run my request"}
        </button>
        <label htmlFor="fault-next" className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
          Live demo · next fault
        </label>
        <div className="relative flex items-center">
          <select id="fault-next" value={pick} disabled={busy} onChange={(e) => setPick(e.target.value as FaultPick)}
            className="h-9 w-full appearance-none rounded-lg border border-dashed border-faint bg-panel pl-2.5 pr-8 text-[13px] text-ink">
            {PICKS.map((p) => (
              <option key={p} value={p}>
                {PICK_LABEL[p]}
              </option>
            ))}
          </select>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="pointer-events-none absolute right-3 text-muted">
            <path d="M3 4.5l3 3 3-3" />
          </svg>
        </div>
        <div className="flex items-center justify-between">
          <button type="button" disabled={busy} onClick={() => run("order-n")}
            className="h-[34px] rounded-lg border border-line bg-panel px-3 text-[13px] disabled:cursor-wait">
            {state.running === "order-n" ? "Running…" : "Another order"}
          </button>
          <button type="button" disabled={busy} onClick={onReset} className="h-[34px] px-1 text-[13px] text-muted hover:text-ink disabled:cursor-wait">
            {state.running === "reset" ? "Resetting…" : "Reset demo"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11.5px] text-muted">
        <span className={`size-1.5 rounded-full ${live ? "bg-accent" : "bg-warn"}`} />
        <span className="tracking-[0.08em] text-ink">{fixture ? `FIXTURE · ${fixture}` : state.mode.toUpperCase()}</span>
        {state.reload && <span className="w-full">reloaded {state.reload.at} via {state.reload.via}</span>}
      </div>
    </aside>
  );
}

function Mark({ status, running, viewing, tone, n }: {
  status: ConsoleState["beats"][number]["status"];
  running: boolean;
  viewing: boolean;
  tone?: "fail" | "win";
  n: number;
}) {
  const box = "flex size-6 shrink-0 items-center justify-center rounded-full";
  if (running || status === "running") {
    return <span className="size-6 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-ink" aria-label="Running" />;
  }
  if (status === "done") {
    // The viewed beat carries its result's colour; earlier beats a plain check.
    const fail = viewing && tone === "fail";
    return (
      <span className={`${box} ${fail ? "bg-fail/14 text-fail" : viewing ? "bg-accent/14 text-accent" : "bg-card text-muted"}`}>
        <Icon kind={fail ? "cross" : "check"} />
      </span>
    );
  }
  return (
    <span className={`${box} border font-mono text-[11px] ${status === "next" ? "border-accent text-accent" : "border-line-strong text-muted"}`}>
      {n}
    </span>
  );
}
