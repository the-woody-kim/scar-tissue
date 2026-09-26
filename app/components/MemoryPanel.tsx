import type { AttemptView, HitView, IncidentView, MemoryView } from "@/lib/state";
import { Card, Eyebrow, Icon, Panel } from "./ui";

const COUNT = ["", "It", "Both", "All three", "All four"];

export default function MemoryPanel({ memory }: { memory: MemoryView }) {
  // With the transfer box on screen, two hits fit; three push it off the panel.
  const hits = memory.kind === "recall" ? memory.hits.slice(0, memory.transferred ? 2 : 3) : [];
  return (
    <Panel className="min-w-0 grow gap-3.5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Eyebrow>03 · Memory</Eyebrow>
          <Eyebrow>{memory.kind === "recall" && memory.index === "$lookup" ? "Atlas · $lookup" : "Atlas Vector Search"}</Eyebrow>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-semibold">{memory.kind === "recall" ? memory.title : "Stored"}</h2>
          <span className="font-mono text-xs text-muted">
            {memory.kind === "recall"
              ? memory.index === "$lookup" ? `${hits.length} of ${memory.of} incidents` : `${memory.index} · top ${hits.length} of ${memory.of}`
              : `${memory.counts.live + memory.counts.seed} incidents · ${memory.counts.live} live · ${memory.counts.seed} seed`}
          </span>
        </div>
      </div>
      {memory.kind === "recall" ? (
        <>
          <Card className="gap-1.5 px-[18px] py-3">
            <Eyebrow>Query · {memory.query.label}</Eyebrow>
            <div className="font-mono text-[12.5px] leading-[1.55]">{memory.query.text}</div>
          </Card>
          {hits.map((h, i) => (
            <Hit key={i} h={h} />
          ))}
          {memory.transferred ? (
            <Card className="gap-2 px-[18px] py-3">
              <Eyebrow>
                Transferred as tests · #{memory.transferred.incident} → {memory.transferred.tool}
              </Eyebrow>
              <div className="flex flex-wrap gap-1.5">
                {memory.transferred.cases.map((id) => (
                  <span key={id} className="rounded-[5px] border border-line px-2 py-0.5 font-mono text-xs">
                    {id}
                  </span>
                ))}
              </div>
              <p className="text-[13px] text-muted">{memory.transferred.note}</p>
            </Card>
          ) : (
            <p className="mt-auto border-t border-line pt-3 text-[12.5px] text-muted">
              One aggregation:{" "}
              {memory.index !== "$lookup" && (
                <>
                  <code className="font-mono text-ink">$vectorSearch</code> then{" "}
                </>
              )}
              <code className="font-mono text-ink">$lookup</code> into policies, so every incident arrives with the fixes
              it produced — promoted and rejected.
            </p>
          )}
        </>
      ) : (
        <>
          {memory.note && (
            <Card className="px-[18px] py-3">
              <p className="text-[13px] text-muted">{memory.note}</p>
            </Card>
          )}
          {memory.live.map((inc, i) => (
            <Card key={i} className="gap-2 px-[18px] py-3">
              <IncidentHead inc={inc} />
              <Attempts inc={inc} />
            </Card>
          ))}
          <Card className="gap-2.5 px-[18px] py-3.5">
            <Eyebrow>Seed history · other systems</Eyebrow>
            {memory.seed.map((s) => (
              <div key={s.tool} className="flex flex-col">
                <span className="font-mono text-xs text-muted">{s.tool}</span>
                <span className="text-[13px]">{s.summary}</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </Panel>
  );
}

function Hit({ h }: { h: HitView }) {
  return (
    <Card className="gap-2 px-[18px] py-3">
      <IncidentHead inc={h} score={h.score} />
      {h.attempts.length > 0 ? (
        <>
          <Attempts inc={h} />
          <p className="text-[12.5px] text-muted">{COUNT[h.attempts.length] ?? "All"} went to the proposer as context.</p>
        </>
      ) : (
        <p className="text-[12.5px] text-muted">No fixes on record — history from another system.</p>
      )}
    </Card>
  );
}

function IncidentHead({ inc, score }: { inc: IncidentView; score?: number }) {
  return (
    <>
      <div className="flex items-center gap-2.5 font-mono text-xs">
        {score !== undefined && <span className="text-[14px] font-semibold">{score.toFixed(2)}</span>}
        <span className={`rounded-[5px] border px-1.5 py-px text-[10.5px] tracking-[0.08em] ${inc.origin === "live" ? "border-line-strong text-ink" : "border-line text-muted"}`}>
          {inc.origin.toUpperCase()}
        </span>
        <span className="text-muted">
          {inc.tool}
          {inc.incident && ` · incident #${inc.incident}`}
        </span>
      </div>
      <div className="text-[14px]">{inc.summary}</div>
    </>
  );
}

function Attempts({ inc }: { inc: IncidentView }) {
  return (
    <div className="flex flex-col gap-1 border-t border-line pt-2 text-[13px]">
      {inc.attempts.map((a) => (
        <Attempt key={a.name} a={a} />
      ))}
      {inc.carried && (
        <span className="text-muted">
          Carried to {inc.carried.tool} as {inc.carried.caseId} → v{inc.carried.version}.
        </span>
      )}
    </div>
  );
}

function Attempt({ a }: { a: AttemptView }) {
  const ok = a.status === "promoted";
  return (
    <div className="flex items-center gap-2">
      <Icon kind={ok ? "check" : "cross"} className={ok ? "text-accent" : "text-fail"} />
      <span className={ok ? "text-accent" : "text-fail"}>
        {a.version ? `v${a.version} · ` : ""}
        {a.name}
      </span>
      <span className="text-muted">
        {a.status} · {a.detail}
      </span>
    </div>
  );
}
