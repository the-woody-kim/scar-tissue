"use client";

import { useEffect, useRef, useState } from "react";
import type { PolicyCaseView, PolicyView } from "@/lib/state";
import { Eyebrow, Icon } from "./ui";

const GROUPS: { origin: PolicyCaseView["origin"]; label: string }[] = [
  { origin: "seed", label: "Seed · written by hand" },
  { origin: "incident", label: "From incidents" },
  { origin: "transfer", label: "Transferred to new tools" },
];

const TONE = {
  pass: { icon: "check", color: "text-accent" },
  fail: { icon: "cross", color: "text-fail" },
  uncertain: { icon: "dash", color: "text-warn" },
} as const;

// The header pill. Clicking it opens the cases that earned the active version.
export default function PolicyPill({ policy }: { policy: PolicyView }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const allPass = policy.pass === policy.total;
  return (
    <div ref={root} className="relative">
      <button type="button" aria-expanded={open} aria-controls="policy-cases" onClick={() => setOpen((o) => !o)}
        className={`flex h-11 items-center gap-2.5 rounded-[22px] border bg-panel px-4 ${open ? "border-line-strong" : "border-line"}`}>
        <span className="size-2 rounded-full bg-accent" />
        <span className="font-semibold">Policy v{policy.version}</span>
        <span className={allPass ? "text-accent" : "text-fail"}>
          {policy.pass}/{policy.total} cases
        </span>
        <span className="font-mono text-xs text-muted">{policy.hash}</span>
      </button>
      {open && (
        <div id="policy-cases" role="dialog" aria-label={`Cases for policy v${policy.version}`}
          className="absolute right-0 top-[52px] z-20 flex w-[780px] flex-col gap-3.5 rounded-[14px] border border-line-strong bg-panel p-[18px] shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-semibold">
              Policy v{policy.version} <span className="font-mono text-[13px] font-normal text-muted">{policy.hash}</span>
            </h2>
            <span className="font-mono text-xs text-muted">
              {policy.evalRunId ? `eval ${policy.evalRunId}` : "baseline"} ·{" "}
              <span className={allPass ? "text-accent" : "text-fail"}>
                {policy.pass}/{policy.total} pass
              </span>
            </span>
          </div>
          {GROUPS.map(({ origin, label }) => {
            const cases = policy.cases.filter((c) => c.origin === origin);
            if (cases.length === 0) return null;
            return (
              <div key={origin} className="flex flex-col gap-1.5">
                <Eyebrow>{label}</Eyebrow>
                <ul className="flex flex-col">
                  {cases.map((c) => (
                    <li key={c.id} className="grid grid-cols-[176px_1fr_auto] items-center gap-3 border-t border-line py-[7px] first:border-t-0">
                      <span className={`flex items-center gap-1.5 font-mono text-[12px] ${TONE[c.outcome].color}`}>
                        <Icon kind={TONE[c.outcome].icon} />
                        {c.id}
                      </span>
                      <span className="text-[13px] text-muted">{c.about}</span>
                      <span className="font-mono text-xs text-code-ink">{c.result}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <p className="border-t border-line pt-3 text-[12.5px] text-muted">
            The evaluator and these cases are fixed code and data. The harness can only add cases from incidents and
            transfers — it can&apos;t edit or remove one.
          </p>
        </div>
      )}
    </div>
  );
}
