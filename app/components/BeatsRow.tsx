"use client";

import { useState } from "react";
import type { BeatId, ConsoleState, FaultPick } from "@/lib/state";
import { Icon } from "./ui";

const PICKS: { value: FaultPick; label: string }[] = [
  { value: "after_commit", label: "timeout after saving" },
  { value: "before_commit", label: "timeout before saving" },
  { value: "after_commit_lookup_down", label: "after saving + lookup down" },
  { value: "none", label: "none" },
];
const DEFAULT_PICK: FaultPick = "after_commit";

export default function BeatsRow({
  state,
  onBeat,
  onReset,
}: {
  state: ConsoleState;
  onBeat: (beat: BeatId, fault?: FaultPick) => void;
  onReset: () => void;
}) {
  // A pick applies to the next run only, then the select goes back to its default.
  const [pick, setPick] = useState<FaultPick>(DEFAULT_PICK);
  const busy = state.running !== null;
  const run = (beat: BeatId) => {
    onBeat(beat, pick === DEFAULT_PICK ? undefined : pick);
    setPick(DEFAULT_PICK);
  };

  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        {state.beats.map((b, i) => {
          const tone =
            b.status === "next"
              ? "border-accent bg-accent font-semibold text-bg"
              : b.status === "done"
                ? "border-line bg-panel text-muted"
                : "border-line bg-panel text-ink";
          return (
            <button key={b.id} type="button" disabled={busy} onClick={() => run(b.id)}
              className={`flex h-11 items-center gap-[9px] rounded-[10px] border px-[18px] text-sm disabled:cursor-wait ${tone}`}>
              {b.status === "done" ? (
                <Icon kind="check" className="text-accent" />
              ) : (
                <span className={`font-mono text-xs ${b.status === "next" ? "" : "text-muted"}`}>{i + 1}</span>
              )}
              <span>{state.running === b.id ? "Running…" : b.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2.5">
        <label htmlFor="fault-next" className="text-[13px] text-muted">
          Fault for the next run
        </label>
        <div className="relative flex items-center">
          <select id="fault-next" value={pick} onChange={(e) => setPick(e.target.value as FaultPick)}
            className="h-11 appearance-none rounded-[10px] border border-dashed border-faint bg-panel pl-3.5 pr-[38px] text-sm text-ink">
            {PICKS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="pointer-events-none absolute right-3.5 text-muted">
            <path d="M3 4.5l3 3 3-3" />
          </svg>
        </div>
        <button type="button" disabled={busy} onClick={() => run("order-n")}
          className="h-11 rounded-[10px] border border-line bg-panel px-4 text-sm disabled:cursor-wait">
          {state.running === "order-n" ? "Running…" : "Run another order"}
        </button>
        <span className="h-6 w-px bg-line" />
        <button type="button" disabled={busy} onClick={onReset} className="h-11 px-2 text-[13px] text-muted hover:text-ink">
          Reset demo
        </button>
      </div>
    </div>
  );
}
