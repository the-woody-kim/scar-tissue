import type { ConsoleState } from "@/lib/state";
import PolicyPill from "./PolicyPill";

export default function Header({ state, fixture }: { state: ConsoleState; fixture?: string }) {
  const { policy, reload } = state;
  const badge = fixture ? `FIXTURE · ${fixture}` : state.mode.toUpperCase();
  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-6">
      <div className="flex items-baseline gap-3.5">
        <div className="text-[19px] font-[650] tracking-[-0.01em]">Scar Tissue</div>
        <div className="text-[13px] text-muted">
          {state.store.name} · {state.store.agent}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {reload && (
          <span className="font-mono text-xs text-muted">
            reloaded {reload.at} via {reload.via}
          </span>
        )}
        <PolicyPill policy={policy} />
        <span className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 font-mono text-[11px] tracking-[0.08em]">
          <span className={`size-1.5 rounded-full ${state.mode === "live" && !fixture ? "bg-accent" : "bg-warn"}`} />
          <span>{badge}</span>
        </span>
      </div>
    </header>
  );
}
