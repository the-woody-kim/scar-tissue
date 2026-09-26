import type { Tile, Tone } from "./story";

// The four tiles are the loop's progress track: one phase pair each, left to right in time.
const BAR: Record<Tone, string> = {
  done: "bg-muted",
  fail: "bg-fail",
  win: "bg-accent",
  now: "bg-ink",
  wait: "bg-line",
};
const LABEL: Record<Tone, string> = {
  done: "text-muted",
  fail: "text-fail",
  win: "text-accent",
  now: "text-ink",
  wait: "text-muted",
};
const FRAME: Record<Tone, string> = {
  done: "border-line",
  fail: "border-line",
  win: "border-accent/45",
  now: "border-ink",
  wait: "border-line",
};

export default function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <ol aria-label="Learning loop" className="grid shrink-0 grid-cols-4 gap-4">
      {tiles.map((t) => (
        <li key={t.phase} aria-current={t.tone === "now" ? "step" : undefined}
          className={`flex flex-col gap-2.5 overflow-hidden rounded-[14px] border bg-panel px-[18px] pb-4 ${FRAME[t.tone]}`}>
          <span className={`-mx-[18px] h-[3px] ${BAR[t.tone]}`} />
          <span className={`flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] ${LABEL[t.tone]}`}>
            {t.phase}
            {t.tone === "now" && <span className="rounded-[3px] bg-ink px-1 text-[9.5px] text-bg">Now</span>}
          </span>
          <span className="flex items-baseline gap-2">
            <span className={`text-[34px] font-semibold leading-none ${t.tone === "fail" ? "text-fail" : t.tone === "win" ? "text-accent" : t.tone === "wait" ? "text-muted" : "text-ink"}`}>
              {t.value}
            </span>
            <span className={`text-[15px] font-semibold ${t.tone === "wait" ? "text-muted" : ""}`}>{t.unit}</span>
          </span>
          <span className="truncate text-[13px] text-muted">{t.caption}</span>
        </li>
      ))}
    </ol>
  );
}
