import { Client } from "langsmith";
import { traceable } from "langsmith/traceable";

// LangSmith tracing. Off unless LANGSMITH_TRACING=true and LANGSMITH_API_KEY are set; then every
// beat, eval, proposal and model call lands as one trace tree. Observability only: nothing reads it back.
type KV = Record<string, unknown>;

const g = globalThis as unknown as { __st_ls?: Client };
export const tracer = (g.__st_ls ??= new Client());

// Wraps fn in a span. `inputs` picks what to log, so the Db handle and Run objects never get serialized.
export function span<A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>, inputs: (...a: A) => KV, outputs?: (r: R) => KV) {
  const traced = traceable(async (_view: KV, a: A) => fn(...a), {
    name,
    run_type: "chain",
    client: tracer,
    processInputs: (i) => (i as unknown as { args: [KV, A] }).args[0],
    processOutputs: (o) => (outputs ? outputs((o as { outputs: R }).outputs ?? (o as R)) : (o as KV)),
  });
  return (...a: A): Promise<R> => traced(inputs(...a), a);
}

// CLI scripts exit right after the work; send what's queued first.
export const flushTraces = () => tracer.awaitPendingTraceBatches();
