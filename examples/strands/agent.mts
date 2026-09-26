// A Strands Agents order agent that reaches Northside Grocer only through Scar Tissue's MCP server,
// so every tool call runs under the harness's active policy. Kept out of the app: the engine owns
// its own loop, and Strands pins openai@6 while the app runs openai@7.
//
//   npm run agent                                   # the default task, no fault
//   npm run agent -- --fault after_commit           # the order-1 fault, against whatever version is active
//   npm run agent -- "Refund Priya Nair (c_1180) $3.25 on order o_4H8M, reason damaged."
import { Agent, McpClient } from "@strands-agents/sdk";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

process.loadEnvFile(new URL("../../.env.local", import.meta.url));
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error("Set OPENROUTER_API_KEY in .env.local");

const argv = process.argv.slice(2);
const fi = argv.indexOf("--fault");
const fault = fi >= 0 ? argv.splice(fi, 2)[1] : null;
const task = argv.join(" ") || "Place an order for Jo Park (c_8810): 2 × Bananas 6 (BAN-6).";

const url = new URL(process.env.SCAR_TISSUE_MCP_URL || "http://localhost:3700/api/mcp");
if (fault) url.searchParams.set("fault", fault);

const mcp = new McpClient({ applicationName: "strands-order-agent", transport: new StreamableHTTPClientTransport(url) });
const agent = new Agent({
  model: new OpenAIModel({
    api: "chat",
    modelId: process.env.OPENROUTER_EXECUTOR_MODEL || process.env.EXECUTOR_MODEL || "openai/gpt-5.4-mini",
    temperature: 0,
    apiKey,
    clientConfig: { baseURL: "https://openrouter.ai/api/v1" },
  }),
  systemPrompt: "You are the order agent for Northside Grocer. Complete the task with the tools, then answer in one sentence: done, failed, or escalated, and why.",
  tools: [mcp],
});

try {
  console.log(`task: ${task}${fault ? `  (fault: ${fault})` : ""}\n`);
  await agent.invoke(task);
} finally {
  await mcp.disconnect();
}
