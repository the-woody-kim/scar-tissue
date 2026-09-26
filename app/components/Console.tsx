"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BeatId, ConsoleState, FaultPick } from "@/lib/state";
import FixesPanel from "./FixesPanel";
import PolicyPill from "./PolicyPill";
import Sidebar from "./Sidebar";
import Tiles from "./Tiles";
import TracePanel from "./TracePanel";
import { tell } from "./story";
import { Segments } from "./ui";

// In fixture mode a beat button moves to that beat's saved state instead of calling the engine.
const FIXTURE_FOR: Record<BeatId | "reset", string> = {
  reset: "reset",
  "order-1": "order-1",
  "order-2": "order-2",
  "grant-issue_refund": "grant",
  "refund-1": "refund-1",
  "order-n": "order-n",
  prompt: "order-n",
};

export default function Console({ initial, fixture }: { initial?: ConsoleState; fixture?: string }) {
  const router = useRouter();
  const [state, setState] = useState<ConsoleState | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fixture) return;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) throw new Error(`GET /api/state → ${res.status}`);
        const next = (await res.json()) as ConsoleState;
        if (alive) {
          setState(next);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    poll();
    const id = setInterval(poll, 500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fixture]);

  const post = useCallback(async (url: string, body?: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(`POST ${url} → ${res.status}${body?.error ? ` · ${body.error}` : ""}`);
    } else setError(null);
  }, []);

  const onBeat = (beat: BeatId, fault?: FaultPick) => {
    if (fixture) router.push(`/?fixture=${FIXTURE_FOR[beat]}`);
    else post("/api/beat", { beat, ...(fault ? { fault } : {}) });
  };
  const onPrompt = (prompt: string, fault: FaultPick) => post("/api/try", { prompt, fault });
  const onReset = () => {
    if (fixture) router.push("/?fixture=reset");
    else post("/api/reset");
  };

  const story = state ? tell(state) : null;

  return (
    <main className="flex min-h-screen items-center justify-center">
      {state && story ? (
        <div className="flex h-[920px] w-[1536px] overflow-hidden">
          <Sidebar state={state} story={story} fixture={fixture} onBeat={onBeat} onPrompt={onPrompt} onReset={onReset} />
          <div className="flex min-w-0 grow flex-col gap-5 px-8 py-7">
            <header className="flex shrink-0 items-start justify-between gap-8">
              <div className="flex min-w-0 flex-col gap-1">
                <div className={`font-mono text-[11px] uppercase tracking-[0.1em] ${state.running ? "text-ink" : "text-muted"}`}>{story.eyebrow}</div>
                <h1 className="text-[26px] font-[650] tracking-[-0.01em]">{story.title}</h1>
                <p className="text-[15px] text-soft">
                  <Segments parts={story.headline} />
                </p>
              </div>
              <div className="shrink-0">
                <PolicyPill policy={state.policy} />
              </div>
            </header>
            <Tiles tiles={story.tiles} />
            <div className="grid min-h-0 grow grid-cols-[500px_minmax(0,1fr)] gap-4">
              <TracePanel key={story.mode} story={story} memory={state.memory} />
              <FixesPanel story={story} harness={state.harness} versions={state.versions} />
            </div>
            {error && <p className="shrink-0 font-mono text-xs text-fail">{error}</p>}
          </div>
        </div>
      ) : (
        <div className="m-auto flex flex-col items-center gap-2 text-center">
          <div className="text-[19px] font-[650]">Scar Tissue</div>
          <p className="text-[13px] text-muted">
            Waiting for the engine{error ? ` — ${error}` : ""}. Open{" "}
            <Link className="text-ink underline" href="/?fixture=order-1">
              /?fixture=order-1
            </Link>{" "}
            to see the page with saved state.
          </p>
        </div>
      )}
    </main>
  );
}
