import { NextResponse, type NextRequest } from "next/server";
import { resolveConnectorToken } from "@/server/connectors";
import { MCP_PROTOCOL_VERSIONS, handleMcpMessage } from "@/server/mcp";

// Remote MCP endpoint (streamable HTTP, stateless, JSON responses). The secret token in the path
// identifies the workspace, so it works with "no auth" custom connectors in Claude and ChatGPT.
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const invalid = (id: string | number | null) => ({ jsonrpc: "2.0" as const, id, error: { code: -32600, message: "Invalid request" } });

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await resolveConnectorToken(token);
  if (!ctx) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unknown or revoked connector URL. Create a new one in Your AI (Settings › Your AI)." } }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const batch = Array.isArray(body);
  const messages = ((batch ? body : [body]) as unknown[]).slice(0, 20);

  // A client on a protocol revision we don't speak (e.g. the stateless 2026-07-28) gets a plain 4xx
  // with no modern error code, so a dual-era client falls back to initialize.
  const header = req.headers.get("mcp-protocol-version");
  const modern = messages.some((m) => isRecord(m) && isRecord(m.params) && isRecord(m.params._meta) && "io.modelcontextprotocol/protocolVersion" in m.params._meta);
  if ((header && !MCP_PROTOCOL_VERSIONS.includes(header)) || modern) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `This server speaks MCP ${MCP_PROTOCOL_VERSIONS[0]} and earlier; use initialize.` } }, 400);
  }

  // Ad Library searches use the platform's shared Meta token: one per request, the rest are refused.
  const isAdSearch = (m: unknown) => isRecord(m) && m.method === "tools/call" && isRecord(m.params) && m.params.name === "search_competitor_ads";
  const firstAdSearch = messages.findIndex(isAdSearch);

  const replies = (
    await Promise.all(
      messages.map(async (m, i) => {
        if (!isRecord(m)) return invalid(null);
        const id = typeof m.id === "string" || typeof m.id === "number" ? m.id : null;
        if (i !== firstAdSearch && isAdSearch(m)) {
          return { jsonrpc: "2.0" as const, id, result: { content: [{ type: "text", text: "One search_competitor_ads per request. Send the next search in a new request." }], isError: true } };
        }
        try {
          return await handleMcpMessage(ctx, m as Parameters<typeof handleMcpMessage>[1]);
        } catch (err) {
          console.error("[mcp] message failed", err);
          return { jsonrpc: "2.0" as const, id, error: { code: -32603, message: "Internal error" } };
        }
      }),
    )
  ).filter((r) => r !== null);
  if (replies.length === 0) return new NextResponse(null, { status: 202 });
  return json(batch ? replies : replies[0]);
}

// No server-initiated stream: this server only answers requests.
export async function GET() {
  return new NextResponse("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 204 });
}
