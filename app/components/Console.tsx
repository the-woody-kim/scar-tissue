"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BeatId, ConsoleState, FaultPick } from "@/lib/state";
import BeatsRow from "./BeatsRow";
import HarnessPanel from "./HarnessPanel";
import Header from "./Header";
import MemoryPanel from "./MemoryPanel";
import RunPanel from "./RunPanel";

// In fixture mode a beat button moves to that beat's saved state instead of calling the engine.
const FIXTURE_FOR: Record<BeatId | "reset", string> = {
  reset: "reset",
  "order-1": "order-1",
  "order-2": "order-2",
  "grant-issue_refund": "grant",
  "refund-1": "refund-1",
  "order-n": "order-n",
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
  const onReset = () => {
    if (fixture) router.push("/?fixture=reset");
    else post("/api/reset");
  };

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="flex h-[920px] w-[1536px] flex-col gap-4 px-6 pb-6 pt-5">
        {state ? (
          <>
            <Header state={state} fixture={fixture} />
            <BeatsRow state={state} onBeat={onBeat} onReset={onReset} />
            <div className="flex min-h-0 grow gap-4">
              <RunPanel run={state.run} />
              <HarnessPanel harness={state.harness} versions={state.versions} check={state.run?.check ?? null} />
              <MemoryPanel memory={state.memory} />
            </div>
          </>
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
        {state && error && <p className="font-mono text-xs text-fail">{error}</p>}
      </div>
    </main>
  );
}
