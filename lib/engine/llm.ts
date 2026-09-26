import OpenAI from "openai";

// OpenRouter through the openai SDK. The provider and model stay fixed for a whole run.
let client: OpenAI | null = null;

export function llm(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Set OPENROUTER_API_KEY in .env.local");
  client ??= new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1", timeout: 60_000, maxRetries: 1 });
  return client;
}

export const models = {
  executor: () => process.env.OPENROUTER_EXECUTOR_MODEL || process.env.EXECUTOR_MODEL || "openai/gpt-5.4-mini",
  proposer: () => process.env.OPENROUTER_PROPOSER_MODEL || process.env.PROPOSER_MODEL || "openai/gpt-5.4-mini",
};

// Every model call goes through here: at most LLM_CONCURRENCY in flight, and 429s back off and retry.
type Params = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
const g = globalThis as unknown as { __st_llm?: { active: number; queue: (() => void)[] } };
const gate = (g.__st_llm ??= { active: 0, queue: [] });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chat(params: Params): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const limit = Number(process.env.LLM_CONCURRENCY || 5);
  while (gate.active >= limit) await new Promise<void>((r) => gate.queue.push(r));
  gate.active++;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await llm().chat.completions.create(params);
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status !== 429 || attempt >= 6) throw e;
        await sleep(Math.min(20_000, 1500 * 2 ** attempt) + Math.random() * 500);
      }
    }
  } finally {
    gate.active--;
    gate.queue.shift()?.();
  }
}
