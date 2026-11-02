import { NextResponse, type NextRequest } from "next/server";
import { resolveConnectorToken } from "@/server/connectors";
import { handleMcpMessage } from "@/server/mcp";

// Remote MCP endpoint (streamable HTTP, stateless, JSON responses). The secret token in the path
// identifies the workspace, so it works with "no auth" custom connectors in Claude and ChatGPT.
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await resolveConnectorToken(token);
  if (!ctx) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unknown or revoked connector URL. Create a new one in Settings › AI & connectors." } }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const batch = Array.isArray(body);
  const messages = ((batch ? body : [body]) as Parameters<typeof handleMcpMessage>[1][]).slice(0, 20);
  const replies = (await Promise.all(messages.map((m) => handleMcpMessage(ctx, m)))).filter((r) => r !== null);
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
