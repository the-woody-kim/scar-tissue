import type { ReactNode } from "react";
import type { CaseView, Outcome, Section } from "@/lib/state";
import type { Segment } from "./story";

export function Eyebrow({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "fail" | "accent" }) {
  const color = tone === "fail" ? "text-fail" : tone === "accent" ? "text-accent" : "text-muted";
  return <div className={`font-mono text-[11px] uppercase tracking-[0.1em] ${color}`}>{children}</div>;
}


export function SectionChip({ section }: { section: Section }) {
  return (
    <span className="rounded-[5px] border border-line px-1.5 py-px font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
      {section}
    </span>
  );
}

// accent: promoted · fail: rejected · screened: dashed, it never ran · now: evaluating
export function Stamp({ tone, children }: { tone: "accent" | "fail" | "screened" | "now"; children: ReactNode }) {
  const color =
    tone === "accent"
      ? "border-accent text-accent"
      : tone === "now"
        ? "border-ink text-ink"
        : tone === "screened"
          ? "border-dashed border-fail text-fail"
          : "border-fail text-fail";
  return (
    <span className={`shrink-0 rounded-md border px-[9px] py-[3px] font-mono text-[11px] font-semibold tracking-[0.1em] ${color}`}>
      {children}
    </span>
  );
}


export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-line bg-panel px-[22px] py-5 ${className}`}>
      {children}
    </section>
  );
}

const CHECK = "M2.5 6.4l2.2 2.2 4.8-5";
const CROSS = "M3 3l6 6M9 3l-6 6";
const DASH = "M3 6h6";

export function Icon({ kind, className = "" }: { kind: "check" | "cross" | "dash"; className?: string }) {
  const d = kind === "check" ? CHECK : kind === "cross" ? CROSS : DASH;
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d={d} />
    </svg>
  );
}

const OUTCOME: Record<Outcome, { icon: "check" | "cross" | "dash"; tone: string; lit: string }> = {
  pass: { icon: "check", tone: "bg-accent/12 text-accent border-transparent", lit: "border-accent" },
  fail: { icon: "cross", tone: "bg-fail/12 text-fail border-fail/40", lit: "border-fail" },
  uncertain: { icon: "dash", tone: "bg-warn/12 text-warn border-warn/40", lit: "border-warn" },
};

export function CaseChip({ c }: { c: CaseView }) {
  const o = OUTCOME[c.outcome];
  return (
    <div className={`flex h-[26px] items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md border px-2 font-mono text-[11px] ${o.tone} ${c.lit ? o.lit : ""}`}>
      <Icon kind={o.icon} />
      <span>{c.id}</span>
    </div>
  );
}

export function CaseGrid({ cases }: { cases: CaseView[] }) {
  const cols = cases.length > 4 ? "grid-cols-3" : "grid-cols-4";
  return (
    <div className={`grid ${cols} gap-1.5`}>
      {cases.map((c) => (
        <CaseChip key={c.id} c={c} />
      ))}
    </div>
  );
}

export function passCount(cases: CaseView[]) {
  return cases.filter((c) => c.outcome === "pass").length;
}

// A diff block. Substrings in `highlights` are underlined — the part a transfer changed, or the
// clause that acted.
export function Diff({ lines, highlights = [] }: { lines: string[]; highlights?: string[] }) {
  return (
    <div className="whitespace-pre-wrap rounded-lg bg-code px-3 py-2.5 font-mono text-[11.5px] leading-[1.65] text-code-ink">
      {lines.map((line, i) => (
        <div key={i}>{underline(line, highlights)}</div>
      ))}
    </div>
  );
}

function underline(line: string, highlights: string[]): ReactNode {
  const hit = highlights.find((h) => line.includes(h));
  if (!hit) return line;
  const at = line.indexOf(hit);
  return (
    <>
      {line.slice(0, at)}
      <span className="underline decoration-1 underline-offset-[3px]">{hit}</span>
      {underline(line.slice(at + hit.length), highlights)}
    </>
  );
}

export const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

// A sentence whose failures read red and whose wins read in the accent.
export function Segments({ parts }: { parts: Segment[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className={p.tone === "fail" ? "text-fail" : p.tone === "win" ? "text-accent" : undefined}>
          {p.t}
        </span>
      ))}
    </>
  );
}

// Panel section heading: a plain title and a mono aside.
export function PanelHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {aside && <span className="font-mono text-[11.5px] text-muted">{aside}</span>}
    </div>
  );
}
