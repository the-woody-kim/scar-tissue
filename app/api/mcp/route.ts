import { handleMcp } from "@/lib/engine/mcp";

// MCP (Streamable HTTP): the order tools under the active policy. `?fault=<pick>` sets the
// session's fault, like the page's picker.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = handleMcp;
export const POST = handleMcp;
export const DELETE = handleMcp;
